import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Supplier {
  id: string;
  name: string;
  trade_name: string | null;
  cnpj_cpf: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface SupplierViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierViewModal({ open, onOpenChange, supplier }: SupplierViewModalProps) {
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);

  useEffect(() => {
    if (open && supplier) {
      fetchLogNames();
    }
  }, [open, supplier]);

  const fetchLogNames = async () => {
    if (!supplier) return;

    setCreatedByName(null);
    setUpdatedByName(null);

    if (supplier.created_by) {
      const { data } = await supabase.rpc("get_profile_name", { p_user_id: supplier.created_by });
      setCreatedByName(data || "Usuário não identificado");
    }

    if (supplier.updated_by && supplier.updated_at !== supplier.created_at) {
      const { data } = await supabase.rpc("get_profile_name", { p_user_id: supplier.updated_by });
      setUpdatedByName(data || "Usuário não identificado");
    }
  };

  if (!supplier) return null;

  const InfoField = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visualizar Fornecedor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoField label="Razão Social" value={supplier.name} />
            <InfoField label="Nome Fantasia" value={supplier.trade_name} />
            <InfoField label="CNPJ/CPF" value={supplier.cnpj_cpf} />
            <InfoField label="Pessoa de Contato" value={supplier.contact_person} />
            <InfoField label="Telefone" value={supplier.phone} />
            <InfoField label="E-mail" value={supplier.email} />
            <InfoField label="Endereço" value={supplier.address} />
            <InfoField label="Cidade" value={supplier.city} />
            <InfoField label="Estado" value={supplier.state} />
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Log de Atividades</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Cadastrado por</span>
                <p className="font-medium">{createdByName || (supplier.created_by ? "Carregando..." : "Não registrado")}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(supplier.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>

              {updatedByName && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Última alteração por</span>
                  <p className="font-medium">{updatedByName}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(supplier.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
