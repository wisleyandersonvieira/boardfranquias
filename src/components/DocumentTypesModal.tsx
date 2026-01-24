import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DocumentTypesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface DocumentType {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function DocumentTypesModal({ open, onOpenChange, canEdit = true, canDelete = true }: DocumentTypesModalProps) {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const { toast } = useToast();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      fetchDocumentTypes();
    }
  }, [open]);

  const fetchDocumentTypes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .order("code");

      if (error) throw error;
      setDocumentTypes(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar tipos de documento",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setName("");
    setIsActive(true);
  };

  const handleEdit = (docType: DocumentType) => {
    setEditingId(docType.id);
    setCode(docType.code);
    setName(docType.name);
    setIsActive(docType.is_active);
    setActiveTab("form");
  };

  const handleSubmit = async () => {
    if (!code.trim() || !name.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Código e nome são obrigatórios.",
      });
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("document_types")
          .update({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            is_active: isActive,
          })
          .eq("id", editingId);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Tipo de documento atualizado com sucesso.",
        });
      } else {
        const { error } = await supabase
          .from("document_types")
          .insert({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            is_active: isActive,
          });

        if (error) {
          if (error.code === "23505") {
            throw new Error("Já existe um tipo de documento com este código.");
          }
          throw error;
        }

        toast({
          title: "Sucesso",
          description: "Tipo de documento cadastrado com sucesso.",
        });
      }

      resetForm();
      fetchDocumentTypes();
      setActiveTab("list");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    setLoading(true);
    try {
      // Check if document type is linked to accounts payable
      const { count: payableCount, error: payableError } = await supabase
        .from("accounts_payable")
        .select("*", { count: "exact", head: true })
        .eq("document_type", code);

      if (payableError) throw payableError;

      // Check if document type is linked to accounts receivable
      const { count: receivableCount, error: receivableError } = await supabase
        .from("accounts_receivable")
        .select("*", { count: "exact", head: true })
        .eq("document_type", code);

      if (receivableError) throw receivableError;

      const totalLinks = (payableCount || 0) + (receivableCount || 0);

      if (totalLinks > 0) {
        toast({
          variant: "destructive",
          title: "Não é possível excluir",
          description: `Este tipo de documento está vinculado a ${totalLinks} registro(s) de contas a pagar/receber. Você pode desativá-lo ao invés de excluir.`,
        });
        setLoading(false);
        return;
      }

      if (!window.confirm("Tem certeza que deseja excluir este tipo de documento?")) {
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("document_types")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Tipo de documento excluído com sucesso.",
      });

      fetchDocumentTypes();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("document_types")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      setDocumentTypes(prev =>
        prev.map(dt => (dt.id === id ? { ...dt, is_active: !currentStatus } : dt))
      );

      toast({
        title: "Sucesso",
        description: `Tipo de documento ${!currentStatus ? "ativado" : "desativado"} com sucesso.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tipos de Documento</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Lista</TabsTrigger>
            {canEdit && <TabsTrigger value="form">{editingId ? "Editar" : "Novo"}</TabsTrigger>}
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDocumentTypes}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("form");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Tipo
                </Button>
              )}
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-center">Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentTypes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum tipo de documento cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    documentTypes.map((docType) => (
                      <TableRow key={docType.id}>
                        <TableCell className="font-mono font-medium">{docType.code}</TableCell>
                        <TableCell>{docType.name}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={docType.is_active}
                            onCheckedChange={() => handleToggleActive(docType.id, docType.is_active)}
                            disabled={!canEdit}
                          />
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(docType)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(docType.id, docType.code)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {canEdit && (
            <TabsContent value="form" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ex: NF, RC, CT"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Nota Fiscal"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="isActive">Ativo</Label>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setActiveTab("list");
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
