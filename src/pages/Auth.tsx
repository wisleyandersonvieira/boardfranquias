import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import boardLogo from "@/assets/board-sistemas-logo.png";
import boardTextLogo from "@/assets/board-sistemas-text-logo.png";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        variant: "destructive",
        title: "Email obrigatório",
        description: "Por favor, informe seu email para recuperar a senha.",
      });
      return;
    }

    setResetLoading(true);
    try {
      // Verificar se o email existe na tabela profiles (usuário cadastrado e ativo)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, is_active')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (profileError) {
        console.error('Erro ao verificar email:', profileError);
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Ocorreu um erro ao verificar o email. Tente novamente.",
        });
        return;
      }

      if (!profile) {
        toast({
          variant: "destructive",
          title: "Email não encontrado",
          description: "Este email não está cadastrado no sistema.",
        });
        return;
      }

      if (!profile.is_active) {
        toast({
          variant: "destructive",
          title: "Usuário inativo",
          description: "Este usuário ainda não foi ativado pelo administrador.",
        });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro ao enviar email",
          description: error.message,
        });
        return;
      }

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
        duration: 6000,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro no login",
          description: error.message,
        });
        return;
      }

      // Verificar se o usuário está ativo
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.user.id)
          .single();

        if (!profile?.is_active) {
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Acesso negado",
            description: "Seu cadastro está aguardando aprovação do administrador.",
          });
          return;
        }
      }

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={boardLogo} alt="Board Sistemas" className="h-16 w-16" />
          </div>
          <div className="flex justify-center">
            <img src={boardTextLogo} alt="Board Sistemas" className="h-12" />
          </div>
          <CardDescription>Sistema de Gestão Financeira</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full text-sm text-muted-foreground"
              onClick={handleForgotPassword}
              disabled={resetLoading}
            >
              {resetLoading ? "Enviando..." : "Esqueci minha senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;