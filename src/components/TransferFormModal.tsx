import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { validateCashControlPeriod } from "@/utils/periodValidation";

const formSchema = z.object({
  transfer_date: z.date({
    required_error: "Data é obrigatória",
  }),
  source_account_id: z.string().min(1, "Conta origem é obrigatória"),
  source_account_type: z.enum(['current', 'cash', 'card', 'delivery']),
  destination_account_id: z.string().min(1, "Conta destino é obrigatória"),
  destination_account_type: z.enum(['current', 'cash', 'card', 'delivery']),
  amount: z.string().min(1, "Valor é obrigatório").transform((val) => parseFloat(val)),
  description: z.string().optional(),
}).refine(
  (data) => {
    return !(data.source_account_id === data.destination_account_id && 
             data.source_account_type === data.destination_account_type);
  },
  {
    message: "Conta origem deve ser diferente da conta destino",
    path: ["destination_account_id"],
  }
);

type FormData = z.infer<typeof formSchema>;

interface Transfer {
  id: string;
  store_id: string;
  transfer_date: string;
  source_account_id: string;
  destination_account_id: string;
  source_account_type: 'current' | 'cash' | 'card' | 'delivery';
  destination_account_type: 'current' | 'cash' | 'card' | 'delivery';
  amount: number;
  description: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
}

interface Store {
  id: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
  type: 'current' | 'cash' | 'card' | 'delivery';
  store_name?: string;
}

interface TransferFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer?: Transfer | null;
  readonly?: boolean;
  stores: Store[];
  accounts: Account[];
}

export function TransferFormModal({ 
  open, 
  onOpenChange, 
  transfer, 
  readonly = false,
  stores,
  accounts 
}: TransferFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      transfer_date: new Date(),
      source_account_id: "",
      source_account_type: "current",
      destination_account_id: "",
      destination_account_type: "current",
      amount: "" as any,
      description: "",
    },
  });

  // Carrega dados do transfer quando em modo de edição
  useEffect(() => {
    if (transfer && open) {
      form.reset({
        transfer_date: new Date(transfer.transfer_date + 'T12:00:00'),
        source_account_id: transfer.source_account_id,
        source_account_type: transfer.source_account_type,
        destination_account_id: transfer.destination_account_id,
        destination_account_type: transfer.destination_account_type,
        amount: transfer.amount.toString() as any,
        description: transfer.description || "",
      });

      // Fetch log names when in readonly mode
      if (readonly) {
        const fetchNames = async () => {
          if (transfer.created_by) {
            const { data } = await supabase.rpc("get_profile_name", { p_user_id: transfer.created_by });
            setCreatedByName(data || 'Usuário não identificado');
          }
          if (transfer.updated_by && transfer.updated_at && transfer.created_at &&
              new Date(transfer.updated_at).getTime() !== new Date(transfer.created_at).getTime()) {
            const { data } = await supabase.rpc("get_profile_name", { p_user_id: transfer.updated_by });
            setUpdatedByName(data || 'Usuário não identificado');
          } else {
            setUpdatedByName(null);
          }
        };
        fetchNames();
      }
    } else if (!transfer && open) {
      form.reset({
        transfer_date: new Date(),
        source_account_id: "",
        source_account_type: "current",
        destination_account_id: "",
        destination_account_type: "current",
        amount: "" as any,
        description: "",
      });
      setCreatedByName(null);
      setUpdatedByName(null);
    }
  }, [transfer, open, form, readonly]);

  const onSubmit = async (data: FormData) => {
    if (readonly) return;

    setLoading(true);

    // Verificar se o período está bloqueado para pagamento
    console.log('🔍 Verificando bloqueio de período para transferência:', {
      transferDate: format(data.transfer_date, 'yyyy-MM-dd'),
      year: data.transfer_date.getUTCFullYear(),
      month: data.transfer_date.getUTCMonth() + 1
    });

    const paymentValidation = await validateCashControlPeriod.pagamento(format(data.transfer_date, 'yyyy-MM-dd'));
    
    console.log('📊 Validação de período para transferência:', {
      paymentValidation
    });

    if (paymentValidation.blocked) {
      toast({
        title: "Período Bloqueado",
        description: paymentValidation.message || "O período está bloqueado para operações de transferência",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Obter store_id do usuário atual (primeiro do perfil, senão da tabela user_stores)
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    let storeId: string | null = null;
    
    // Primeiro tenta buscar do perfil
    const { data: profileData } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', userId)
      .single();
    
    storeId = profileData?.store_id || null;
    
    // Se não tem no perfil, busca da tabela user_stores
    if (!storeId) {
      const { data: userStoreData } = await supabase
        .from('user_stores')
        .select('store_id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      
      storeId = userStoreData?.store_id || null;
    }

    if (!storeId) {
      toast({
        title: "Erro",
        description: "Não foi possível identificar a loja do usuário. Verifique se você está associado a alguma loja.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Debug: verificar como a data está sendo processada
    console.log('Data selecionada no formulário:', data.transfer_date);
    console.log('Data formatada para salvar:', format(data.transfer_date, 'yyyy-MM-dd'));
    
    const transferData = {
      store_id: storeId,
      transfer_date: format(data.transfer_date, 'yyyy-MM-dd'),
      source_account_id: data.source_account_id,
      source_account_type: data.source_account_type,
      destination_account_id: data.destination_account_id,
      destination_account_type: data.destination_account_type,
      amount: data.amount,
      description: data.description || null,
      created_by: userId,
    };

    let error;

    if (transfer) {
      // Atualizar - include updated_by
      const result = await supabase
        .from('transfers')
        .update({ ...transferData, updated_by: userId })
        .eq('id', transfer.id);
      error = result.error;
    } else {
      // Criar
      const result = await supabase
        .from('transfers')
        .insert(transferData);
      error = result.error;
    }

    if (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar transferência",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    toast({
      title: "Sucesso",
      description: `Transferência ${transfer ? 'atualizada' : 'cadastrada'} com sucesso`,
    });

    setLoading(false);
    onOpenChange(false);
  };

  const getAccountTypeLabel = (type: string) => {
    const labels = {
      current: 'Conta Corrente',
      cash: 'Conta Caixa',
      card: 'Conta Cartão',
      delivery: 'Delivery'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getAccountsByType = (type: 'current' | 'cash' | 'card' | 'delivery') => {
    return accounts.filter(acc => acc.type === type);
  };

  const watchSourceAccountType = form.watch("source_account_type");
  const watchDestinationAccountType = form.watch("destination_account_type");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readonly ? 'Visualizar' : transfer ? 'Editar' : 'Cadastrar'} Transferência
          </DialogTitle>
          <DialogDescription>
            {readonly 
              ? 'Visualize os detalhes da transferência' 
              : transfer 
                ? 'Edite os dados da transferência' 
                : 'Preencha os dados para cadastrar uma nova transferência'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="transfer_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          disabled={readonly}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: ptBR })
                          ) : (
                            <span>Selecione uma data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => readonly}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />


            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source_account_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Conta Origem</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={readonly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="current">Conta Corrente</SelectItem>
                        <SelectItem value="cash">Conta Caixa</SelectItem>
                        <SelectItem value="card">Conta Cartão</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Origem</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={readonly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma conta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getAccountsByType(watchSourceAccountType).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}{account.store_name ? ` (${account.store_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="destination_account_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Conta Destino</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={readonly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="current">Conta Corrente</SelectItem>
                        <SelectItem value="cash">Conta Caixa</SelectItem>
                        <SelectItem value="card">Conta Cartão</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Destino</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={readonly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma conta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getAccountsByType(watchDestinationAccountType).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}{account.store_name ? ` (${account.store_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      disabled={readonly}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Histórico (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Digite o histórico da transferência..."
                      disabled={readonly}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {readonly && (createdByName || updatedByName) && (
              <div className="space-y-3 pt-2">
                <Separator />
                <h4 className="text-sm font-semibold text-muted-foreground">Log de Atividades</h4>
                <div className="space-y-2 text-sm">
                  {createdByName && transfer?.created_at && (
                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg">
                      <div>
                        <span className="font-medium">Cadastrado por:</span>{" "}
                        <span>{createdByName}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(transfer.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {updatedByName && transfer?.updated_at && (
                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg">
                      <div>
                        <span className="font-medium">Última alteração por:</span>{" "}
                        <span>{updatedByName}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(transfer.updated_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!readonly && (
              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Transferência"}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}