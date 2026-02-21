import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm } from "@/components/ProductForm";
import { ProductList } from "@/components/ProductList";
import { UnitsModal } from "@/components/UnitsModal";

interface ProductsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductsModal({ open, onOpenChange }: ProductsModalProps) {
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("register");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Produtos</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="register">Cadastrar</TabsTrigger>
            <TabsTrigger value="list">Listar</TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cadastrar Novo Produto</CardTitle>
                <CardDescription>
                  Preencha os dados do produto. O código será gerado automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProductForm
                  onUnitsModalOpen={() => setUnitsModalOpen(true)}
                  onSaveSuccess={() => setActiveTab("list")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="space-y-4">
            <ProductList canEdit={true} canDelete={false} />
          </TabsContent>
        </Tabs>

        <UnitsModal
          open={unitsModalOpen}
          onOpenChange={setUnitsModalOpen}
        />
      </DialogContent>
    </Dialog>
  );
}
