import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { parseNfePdf, NfeCabecalho, NfeItemImportado, NfeParseResult } from "@/utils/nfeDanfeParser";
import { parseNfeXml, decodeBase64Xml, looksLikeXml } from "@/utils/nfeXmlParser";
import { useUserMatrix } from "@/hooks/useUserMatrix";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, FileSearch, FileText, History, Loader2, Plus, Save, Search, Trash2, Upload, WalletCards, RefreshCw } from "lucide-react";

type Produto = { id: string; code: string | null; name: string; unit_id?: string | null };
type Fornecedor = { id: string; name: string; cnpj_cpf?: string | null };
type Loja = { id: string; name: string; code?: string | null };
type Unidade = { id: string; symbol: string; name: string };
type DocType = { id: string; code: string; name: string };
type Parcela = { installment_number: number; due_date: string; amount: number };
type ImportacaoHistorico = {
  id: string;
  numero_nfe: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total_nota: number | null;
  status: string;
  contas_pagar_id: string | null;
  created_at: string;
  store_id: string;
  store_name?: string;
  fornecedor_nome?: string;
};

type ItemConferencia = NfeItemImportado & {
  produto_id?: string;
  produto_nome?: string;
  status_vinculo: "vinculado" | "nao_vinculado" | "erro";
  salvar_vinculo?: boolean;
};

const supabaseAny = supabase as any;

export default function NfeImport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { matrixId } = useUserMatrix();
  // Modo embedded (aberto via iframe a partir do Controle de Caixa)
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const embedded = urlParams?.get("embedded") === "1";
  const linkExpenseId = urlParams?.get("linkExpenseId") || null;
  const presetStoreId = urlParams?.get("storeId") || null;
  const [file, setFile] = useState<File | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [reading, setReading] = useState(false);
  const [fetchingAccessKey, setFetchingAccessKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("Aguardando upload do PDF.");
  const [cabecalho, setCabecalho] = useState<NfeCabecalho | null>(null);
  const [itens, setItens] = useState<ItemConferencia[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [storeId, setStoreId] = useState("");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [quickIndex, setQuickIndex] = useState<number | null>(null);
  const [quickData, setQuickData] = useState({ name: "", unit_id: "", group_id: "", subgroup_id: "" });
  const [productPopoverOpen, setProductPopoverOpen] = useState<number | null>(null);
  const [pdfFileExtra, setPdfFileExtra] = useState<File | null>(null);
  const [userBrandId, setUserBrandId] = useState<string | null>(null);
  const [quickGroups, setQuickGroups] = useState<{ id: string; name: string }[]>([]);
  const [quickSubgroups, setQuickSubgroups] = useState<{ id: string; name: string }[]>([]);

  // Modal pré-geração do Contas a Pagar
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [showApDialog, setShowApDialog] = useState(false);
  const [apDocType, setApDocType] = useState("");
  const [apIssueDate, setApIssueDate] = useState("");
  const [apCompetenceDate, setApCompetenceDate] = useState("");
  const [apDueDate, setApDueDate] = useState("");

  // Modal de parcelas
  const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
  const [createdPayableId, setCreatedPayableId] = useState<string | null>(null);
  const [createdPayableAmount, setCreatedPayableAmount] = useState(0);
  const [numberOfInstallments, setNumberOfInstallments] = useState(1);
  const [installments, setInstallments] = useState<Parcela[]>([]);

  // Histórico
  const [historico, setHistorico] = useState<ImportacaoHistorico[]>([]);
  const [histLoja, setHistLoja] = useState<string>("all");
  const [histDataIni, setHistDataIni] = useState("");
  const [histDataFim, setHistDataFim] = useState("");
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const totalProdutos = useMemo(() => itens.reduce((sum, item) => sum + item.valor_total, 0), [itens]);
  const vinculados = itens.filter((item) => item.status_vinculo === "vinculado").length;
  const diferenca = (cabecalho?.valor_total_produtos || cabecalho?.valor_total_nota || 0) - totalProdutos;

  useEffect(() => {
    (async () => {
      const [storesData, docs] = await Promise.all([
        supabase.from("stores").select("id, name, code").order("name"),
        supabase.from("document_types").select("id, code, name").eq("is_active", true).order("code"),
      ]);
      setLojas((current) => current.length ? current : (storesData.data || []));
      setDocTypes((docs.data || []) as DocType[]);
    })();
  }, []);

  // Pré-seleciona a loja quando recebida via query (modo embedded)
  useEffect(() => {
    if (presetStoreId && !storeId) setStoreId(presetStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetStoreId]);

  useEffect(() => { fetchHistorico(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [histLoja, histDataIni, histDataFim]);

  // Carrega brand_id da matriz e os grupos disponíveis para o cadastro rápido
  useEffect(() => {
    (async () => {
      if (!matrixId) return;
      const { data: matrixData } = await supabase
        .from("matrices")
        .select("brand_id")
        .eq("id", matrixId)
        .maybeSingle();
      const brandId = (matrixData as any)?.brand_id || null;
      setUserBrandId(brandId);

      let groupsQuery = supabase
        .from("account_groups")
        .select("id, name")
        .is("parent_id", null)
        .order("name");
      if (brandId) groupsQuery = groupsQuery.eq("brand_id", brandId);
      const { data: groupsData } = await groupsQuery;
      setQuickGroups((groupsData || []) as any);
    })();
  }, [matrixId]);

  // Carrega subgrupos quando o grupo do cadastro rápido muda
  useEffect(() => {
    (async () => {
      if (!quickData.group_id) {
        setQuickSubgroups([]);
        return;
      }
      const { data } = await supabase
        .from("account_groups")
        .select("id, name")
        .eq("parent_id", quickData.group_id)
        .order("name");
      setQuickSubgroups((data || []) as any);
    })();
  }, [quickData.group_id]);

  const fetchHistorico = async () => {
    setLoadingHistorico(true);
    try {
      let q = supabaseAny.from("nfe_importacoes")
        .select("id, numero_nfe, serie, data_emissao, valor_total_nota, status, contas_pagar_id, created_at, store_id, fornecedor_id, stores:store_id(name), suppliers:fornecedor_id(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (histLoja && histLoja !== "all") q = q.eq("store_id", histLoja);
      if (histDataIni) q = q.gte("created_at", `${histDataIni}T00:00:00`);
      if (histDataFim) q = q.lte("created_at", `${histDataFim}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      setHistorico((data || []).map((r: any) => ({
        ...r,
        store_name: r.stores?.name,
        fornecedor_nome: r.suppliers?.name,
      })));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao carregar histórico", description: e.message });
    } finally {
      setLoadingHistorico(false);
    }
  };

  const deleteImportacao = async (imp: ImportacaoHistorico) => {
    if (imp.contas_pagar_id) {
      toast({ variant: "destructive", title: "Não é possível excluir", description: "Esta importação possui Contas a Pagar vinculado. Exclua o título antes." });
      return;
    }
    if (!confirm(`Excluir a importação da NF-e ${imp.numero_nfe || ""}?`)) return;
    const { error: errItems } = await supabaseAny.from("nfe_importacao_itens").delete().eq("importacao_id", imp.id);
    if (errItems) { toast({ variant: "destructive", title: "Erro", description: errItems.message }); return; }
    const { error } = await supabaseAny.from("nfe_importacoes").delete().eq("id", imp.id);
    if (error) { toast({ variant: "destructive", title: "Erro", description: error.message }); return; }
    toast({ title: "Importação excluída" });
    fetchHistorico();
  };

  const reloadImportacaoForRegenerate = async (imp: ImportacaoHistorico) => {
    try {
      // Carrega cabeçalho da importação
      const { data: importData, error: impErr } = await supabaseAny
        .from("nfe_importacoes")
        .select("*, suppliers:fornecedor_id(id, name, cnpj_cpf)")
        .eq("id", imp.id)
        .single();
      if (impErr) throw impErr;

      // Carrega itens da importação
      const { data: itemsData, error: itemsErr } = await supabaseAny
        .from("nfe_importacao_itens")
        .select("*, products:produto_id(name)")
        .eq("importacao_id", imp.id);
      if (itemsErr) throw itemsErr;

      const cab: NfeCabecalho = {
        numero_nfe: importData.numero_nfe,
        serie: importData.serie,
        chave_acesso: importData.chave_acesso,
        fornecedor: importData.suppliers?.name,
        cnpj_fornecedor: importData.suppliers?.cnpj_cpf,
        data_emissao: importData.data_emissao
          ? new Date(importData.data_emissao + "T12:00:00").toLocaleDateString("pt-BR")
          : undefined,
        valor_total_nota: Number(importData.valor_total_nota || 0),
        valor_total_produtos: Number(importData.valor_total_produtos || 0),
        duplicatas: Array.isArray(importData.vencimentos) ? importData.vencimentos : [],
      };

      const itensCarregados: ItemConferencia[] = (itemsData || []).map((it: any) => ({
        codigo_fornecedor: it.codigo_fornecedor || "",
        descricao_original_pdf: it.descricao_original_pdf || "",
        descricao_limpa: it.descricao_limpa || "",
        ncm: it.ncm || "",
        cst: it.cst || "",
        cfop: it.cfop || "",
        unidade: it.unidade || "",
        quantidade: Number(it.quantidade || 0),
        valor_unitario: Number(it.valor_unitario || 0),
        valor_total: Number(it.valor_total || 0),
        valor_icms: it.valor_icms != null ? Number(it.valor_icms) : undefined,
        valor_ipi: it.valor_ipi != null ? Number(it.valor_ipi) : undefined,
        aliquota_icms: it.aliquota_icms != null ? Number(it.aliquota_icms) : undefined,
        aliquota_ipi: it.aliquota_ipi != null ? Number(it.aliquota_ipi) : undefined,
        produto_id: it.produto_id,
        produto_nome: it.products?.name || "",
        status_vinculo: it.produto_id ? "vinculado" : "nao_vinculado",
      }));

      setStoreId(importData.store_id);
      setFornecedor(importData.suppliers ? { id: importData.suppliers.id, name: importData.suppliers.name, cnpj_cpf: importData.suppliers.cnpj_cpf } : null);
      setCabecalho(cab);
      setItens(itensCarregados);
      setImportacaoId(imp.id);
      setStatus("Importação carregada. Confirme os dados e clique em Gerar Contas a Pagar.");
      // Abre o modal de geração diretamente
      const issue = importData.data_emissao || "";
      const firstDue = cab.duplicatas[0]?.vencimento;
      setApIssueDate(issue);
      setApCompetenceDate(issue ? issue.slice(0, 7) + "-01" : "");
      setApDueDate(toIsoDate(firstDue) || issue);
      setApDocType(docTypes.find((d) => /nfe|nf-?e|nota/i.test(d.name))?.code || "");
      setShowApDialog(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao recarregar importação", description: e.message });
    }
  };

  const handleReadPdf = async () => {
    if (!file) {
      toast({ variant: "destructive", title: "Selecione um arquivo", description: "Envie o XML ou o PDF da NF-e antes de ler." });
      return;
    }

    if (isXmlFile(file)) {
      await processXmlFile(file);
    } else {
      await processPdfFile(file);
    }
  };

  const handleFetchByAccessKey = async () => {
    const cleanAccessKey = accessKey.replace(/\D/g, "");
    setAccessKey(cleanAccessKey);

    if (!isNfeAccessKeyValid(cleanAccessKey)) {
      toast({ variant: "destructive", title: "Chave inválida", description: "Informe uma chave de acesso NF-e válida com 44 dígitos." });
      return;
    }

    setFetchingAccessKey(true);
    setStatus("Consultando NF-e no Meu Danfe...");

    try {
      const { data, error } = await supabase.functions.invoke("meudanfe-fetch-nfe", {
        body: { accessKey: cleanAccessKey },
      });
      if (error) {
        const functionError = error as { message?: string; context?: { json?: () => Promise<{ error?: string } | null> } };
        const errorBody = typeof functionError.context?.json === "function"
          ? await functionError.context.json().catch(() => null)
          : null;
        throw new Error(errorBody?.error || functionError.message || "Erro ao consultar a Edge Function");
      }
      if (data?.error) throw new Error(data.error);

      // Preferência: XML estruturado. Fallback: PDF DANFE.
      if (data?.xml) {
        setStatus("XML baixado do Meu Danfe. Processando dados estruturados...");
        const xmlText = looksLikeXml(data.xml) ? data.xml : decodeBase64Xml(data.xml);
        const xmlFile = new File([xmlText], data.xmlName || `NFe-${cleanAccessKey}.xml`, { type: "application/xml" });
        setFile(xmlFile);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await processXmlContent(xmlText);
      } else if (data?.data) {
        setStatus("PDF baixado do Meu Danfe. Lendo páginas do PDF...");
        const pdfFile = base64ToPdfFile(data.data, data.name || `NFe-${cleanAccessKey}.pdf`);
        setFile(pdfFile);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await processPdfFile(pdfFile);
      } else {
        throw new Error("O Meu Danfe não retornou o XML nem o PDF da NF-e.");
      }
    } catch (error: unknown) {
      const friendlyMessage = getEdgeFunctionErrorMessage(error);
      setStatus("Erro ao consultar a NF-e pela chave de acesso.");
      toast({
        variant: "destructive",
        title: "Erro ao consultar NF-e",
        description: friendlyMessage,
      });
    } finally {
      setFetchingAccessKey(false);
    }
  };

  const processXmlFile = async (xmlFile: File) => {
    setReading(true);
    setStatus("Lendo XML da NF-e...");
    try {
      const text = await xmlFile.text();
      await processXmlContent(text);
    } catch (error: any) {
      setStatus("Erro ao ler o XML.");
      toast({ variant: "destructive", title: "Erro ao ler XML", description: error.message || "Não foi possível processar o XML." });
    } finally {
      setReading(false);
    }
  };

  const processXmlContent = async (xmlText: string) => {
    setReading(true);
    setStatus("Processando dados estruturados do XML...");
    try {
      const parsed = parseNfeXml(xmlText);
      if (parsed.itens.length === 0) {
        setStatus("XML sem itens.");
        toast({ variant: "destructive", title: "XML sem itens", description: "Nenhum item foi encontrado no XML da NF-e." });
        return;
      }
      await applyParsedNfe(parsed);
    } catch (error: any) {
      setStatus("Erro ao processar o XML.");
      toast({ variant: "destructive", title: "Erro ao processar XML", description: error.message || "Não foi possível interpretar o XML da NF-e." });
    } finally {
      setReading(false);
    }
  };

  const processPdfFile = async (pdfFile: File) => {
    setReading(true);
    setStatus("Lendo páginas do PDF...");

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const buffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => item.str).join("\n"));
      }

      const fullText = pages.join("\n\n---PAGINA---\n\n");
      const parsed = parseNfePdf(fullText);

      // Quality check: PDFs gerados por foto/scan (mlkit, scanners) não trazem camada de texto.
      // Se o parser não extraiu nenhum item, avisar e abortar.
      if (parsed.itens.length === 0) {
        const lettersCount = (fullText.match(/[A-Za-zÀ-ÿ]/g) || []).length;
        const looksScanned = fullText.trim().length < 500 || lettersCount < 100;
        const description = looksScanned
          ? "Este PDF parece ser uma imagem digitalizada (foto/scan), sem texto pesquisável. Por favor, importe o PDF original da NF-e (gerado pelo emissor ou baixado da SEFAZ) com melhor qualidade."
          : "Não foi possível identificar os itens nesta NF-e. Por favor, importe um PDF com melhor qualidade ou o arquivo original da NF-e.";
        setStatus("PDF sem itens reconhecíveis.");
        toast({ variant: "destructive", title: "Não foi possível ler os itens", description });
        return;
      }

      await applyParsedNfe(parsed);
    } catch (error: any) {
      setStatus("Erro ao ler o PDF.");
      toast({ variant: "destructive", title: "Erro ao ler NF-e", description: error.message || "Não foi possível processar o PDF." });
    } finally {
      setReading(false);
    }
  };

  const applyParsedNfe = async (parsed: NfeParseResult) => {
    if (parsed.cabecalho.chave_acesso) {
      const { data: existing } = await supabaseAny
        .from("nfe_importacoes")
        .select("id")
        .eq("chave_acesso", parsed.cabecalho.chave_acesso)
        .maybeSingle();
      if (existing) {
        setStatus("Esta NF-e já foi importada anteriormente.");
        toast({ variant: "destructive", title: "NF-e duplicada", description: "Esta NF-e já foi importada anteriormente." });
        return;
      }
    }

    const [supplierFound, productsData, storesData, unitsData] = await Promise.all([
      findSupplier(parsed.cabecalho.cnpj_fornecedor, parsed.cabecalho.fornecedor),
      supabase.from("products").select("id, code, name, unit_id").eq("is_active", true).order("name"),
      supabase.from("stores").select("id, name, code").order("name"),
      supabase.from("units_of_measure").select("id, symbol, name").eq("is_active", true).order("name"),
    ]);

    setFornecedor(supplierFound);
    setProdutos(productsData.data || []);
    setLojas(storesData.data || []);
    setUnidades(unitsData.data || []);
    if (!storeId && storesData.data?.length === 1) setStoreId(storesData.data[0].id);

    const correlated = await correlateItems(parsed.itens, supplierFound?.id, productsData.data || []);
    setCabecalho(parsed.cabecalho);
    setItens(correlated);
    setImportacaoId(null);
    setStatus(`NF-e lida com sucesso. ${correlated.length} itens encontrados. ${correlated.filter((i) => i.status_vinculo === "vinculado").length} vinculados automaticamente. ${correlated.filter((i) => i.status_vinculo !== "vinculado").length} aguardando correlação.`);
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = produtos.find((item) => item.id === productId);
    setItens((current) => current.map((item, i) => i === index ? {
      ...item,
      produto_id: productId,
      produto_nome: product?.name,
      status_vinculo: "vinculado",
      salvar_vinculo: item.produto_id === productId ? item.salvar_vinculo : true,
    } : item));
  };

  const updateItemField = (index: number, patch: Partial<ItemConferencia>) => {
    setItens((current) => current.map((item, i) => {
      if (i !== index) return item;
      const merged = { ...item, ...patch } as ItemConferencia;
      if (patch.quantidade !== undefined || patch.valor_unitario !== undefined) {
        merged.valor_total = Number(((merged.quantidade || 0) * (merged.valor_unitario || 0)).toFixed(2));
      }
      return merged;
    }));
  };

  const removeItem = (index: number) => {
    setItens((current) => current.filter((_, i) => i !== index));
  };

  const addEmptyItem = () => {
    setItens((current) => [...current, {
      codigo_fornecedor: "",
      descricao_original_pdf: "",
      descricao_limpa: "",
      unidade: "",
      quantidade: 1,
      valor_unitario: 0,
      valor_total: 0,
      ncm: "",
      cst: "",
      cfop: "",
      valor_icms: 0,
      valor_ipi: 0,
      aliquota_icms: 0,
      aliquota_ipi: 0,
      status_vinculo: "nao_vinculado",
    } as ItemConferencia]);
  };

  const openQuickProduct = (index: number) => {
    const item = itens[index];
    const unit = unidades.find((u) => u.symbol.toUpperCase() === item.unidade.toUpperCase());
    setQuickIndex(index);
    setQuickData({ name: item.descricao_limpa, unit_id: unit?.id || "", group_id: "", subgroup_id: "" });
  };

  const saveQuickProduct = async () => {
    if (quickIndex === null || !quickData.name.trim()) return;
    if (!fornecedor?.id) {
      toast({ variant: "destructive", title: "Fornecedor não localizado", description: "Cadastre ou selecione o fornecedor antes de criar o vínculo." });
      return;
    }
    if (!matrixId) {
      toast({ variant: "destructive", title: "Matriz não localizada", description: "Não foi possível identificar a matriz do usuário para cadastrar o produto." });
      return;
    }

    const item = itens[quickIndex];
    const { data: userData } = await supabase.auth.getUser();
    const { data: nextCode } = await supabase.rpc("get_next_product_code");
    const { data: product, error } = await supabase
      .from("products")
      .insert({
        code: String(nextCode || ""),
        name: quickData.name.trim(),
        description: item.descricao_original_pdf,
        unit_id: quickData.unit_id || null,
        cost_price: item.valor_unitario,
        product_type: "product",
        function_type: "debit",
        matrix_id: matrixId,
        created_by: userData.user?.id,
        is_active: true,
      } as any)
      .select("id, code, name, unit_id")
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Erro ao cadastrar produto", description: error.message });
      return;
    }

    await supabase.from("product_supplier_codes").insert({
      product_id: product.id,
      supplier_id: fornecedor.id,
      supplier_code: item.codigo_fornecedor,
    });

    setProdutos((current) => [...current, product]);
    handleProductChange(quickIndex, product.id);
    setQuickIndex(null);
    toast({ title: "Produto cadastrado", description: "Produto e vínculo do fornecedor criados com sucesso." });
  };

  const validateBeforeSave = () => {
    if (!cabecalho || itens.length === 0) return "Leia uma NF-e antes de salvar.";
    if (!fornecedor?.id) return "Fornecedor da nota não localizado no cadastro.";
    if (!storeId) return "Selecione a loja/empresa da importação.";
    if (itens.some((item) => !item.produto_id)) return "Todos os itens precisam estar vinculados a um produto.";
    return "";
  };

  const saveImport = async () => {
    const validation = validateBeforeSave();
    if (validation) {
      toast({ variant: "destructive", title: "Revise a importação", description: validation });
      return null;
    }

    if (Math.abs(diferenca) > 0.05) {
      const totalNota = cabecalho?.valor_total_produtos || cabecalho?.valor_total_nota || 0;
      const confirmar = window.confirm(
        `Atenção: a soma dos itens (${formatCurrency(totalProdutos)}) diverge do total da nota (${formatCurrency(totalNota)}) em ${formatCurrency(diferenca)}.\n\nDeseja continuar a importação mesmo assim?`,
      );
      if (!confirmar) return null;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const arquivoPath = await uploadPdfIfPossible(file, storeId, cabecalho?.chave_acesso);
      const { data: importacao, error } = await supabaseAny
        .from("nfe_importacoes")
        .insert({
          store_id: storeId,
          matrix_id: matrixId,
          usuario_id: userData.user?.id,
          fornecedor_id: fornecedor?.id,
          numero_nfe: cabecalho?.numero_nfe,
          serie: cabecalho?.serie,
          chave_acesso: cabecalho?.chave_acesso,
          data_emissao: toIsoDate(cabecalho?.data_emissao),
          valor_total_nota: cabecalho?.valor_total_nota,
          valor_total_produtos: totalProdutos,
          vencimentos: cabecalho?.duplicatas || [],
          arquivo_nome: file?.name,
          arquivo_path: arquivoPath,
          status: "conferida",
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = itens.map((item) => ({
        importacao_id: importacao.id,
        produto_id: item.produto_id,
        codigo_fornecedor: item.codigo_fornecedor,
        descricao_original_pdf: item.descricao_original_pdf,
        descricao_limpa: item.descricao_limpa,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        ncm: item.ncm,
        cst: item.cst,
        cfop: item.cfop,
        valor_icms: item.valor_icms,
        valor_ipi: item.valor_ipi,
        aliquota_icms: item.aliquota_icms,
        aliquota_ipi: item.aliquota_ipi,
        status_vinculo: item.status_vinculo,
      }));
      const { error: itemsError } = await supabaseAny.from("nfe_importacao_itens").insert(rows);
      if (itemsError) throw itemsError;

      const linksToSave = itens.filter((item) => item.salvar_vinculo && item.produto_id && fornecedor?.id);
      for (const item of linksToSave) {
        await supabase.from("product_supplier_codes").delete().eq("supplier_id", fornecedor!.id).eq("supplier_code", item.codigo_fornecedor);
        await supabase.from("product_supplier_codes").insert({
          product_id: item.produto_id,
          supplier_id: fornecedor!.id,
          supplier_code: item.codigo_fornecedor,
        } as any);
      }
      setImportacaoId(importacao.id);
      toast({ title: "Importação salva", description: "A NF-e e seus itens foram gravados para rastreabilidade." });
      return importacao.id as string;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao salvar importação", description: error.message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const generateAccountsPayable = async () => {
    // Abre modal de pré-preenchimento (tipo doc, datas)
    const validation = validateBeforeSave();
    if (validation) { toast({ variant: "destructive", title: "Revise a importação", description: validation }); return; }
    const issue = toIsoDate(cabecalho?.data_emissao) || "";
    const firstDue = cabecalho?.duplicatas[0]?.vencimento;
    setApIssueDate(issue);
    setApCompetenceDate(issue ? issue.slice(0, 7) + "-01" : "");
    setApDueDate(toIsoDate(firstDue) || issue);
    setApDocType(docTypes.find((d) => /nfe|nf-?e|nota/i.test(d.name))?.code || "");
    setShowApDialog(true);
  };

  const confirmGenerateAp = async () => {
    if (!apDocType || !apIssueDate || !apCompetenceDate || !apDueDate) {
      toast({ variant: "destructive", title: "Preencha todos os campos", description: "Tipo de documento e datas são obrigatórios." });
      return;
    }
    const id = importacaoId || await saveImport();
    if (!id || !cabecalho || !fornecedor) return;

    setGenerating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const totalAmount = totalProdutos || cabecalho.valor_total_nota || 0;
      // Recupera o caminho do PDF salvo (se houver) para anexar no contas a pagar
      let pdfAttachmentPath: string | null = null;
      let pdfAttachmentName: string | null = null;
      let pdfAttachmentSize: number | null = null;
      try {
        const { data: impRow } = await supabaseAny
          .from("nfe_importacoes")
          .select("arquivo_path, arquivo_nome")
          .eq("id", id)
          .maybeSingle();
        pdfAttachmentPath = impRow?.arquivo_path || null;
        pdfAttachmentName = impRow?.arquivo_nome || (cabecalho.numero_nfe ? `NFe-${cabecalho.numero_nfe}.pdf` : "NFe.pdf");
        pdfAttachmentSize = file?.size || null;
      } catch {}

      const initialAttachments = pdfAttachmentPath
        ? [{
            name: pdfAttachmentName || "NFe.pdf",
            url: pdfAttachmentPath,
            path: pdfAttachmentPath,
            size: pdfAttachmentSize || undefined,
            type: "application/pdf",
          }]
        : [];

      const { data: payable, error } = await supabase.from("accounts_payable").insert({
        store_id: storeId,
        supplier_id: fornecedor.id,
        description: `${apDocType} ${cabecalho.numero_nfe || ""}`.trim(),
        document_number: cabecalho.numero_nfe,
        document_type: apDocType,
        issue_date: apIssueDate,
        due_date: apDueDate,
        data_competencia: apCompetenceDate,
        amount: totalAmount,
        total_amount: totalAmount,
        status: "pending",
        created_by: userData.user?.id,
        notes: `Importação NF-e: ${id}`,
        attachments: initialAttachments,
      } as any).select("id").single();
      if (error) throw error;

      // Carrega itens persistidos da importação (já têm produto_id confirmado)
      const { data: importedItems, error: importedItemsError } = await supabaseAny
        .from("nfe_importacao_itens")
        .select("produto_id, quantidade, valor_unitario, valor_total")
        .eq("importacao_id", id);
      if (importedItemsError) throw importedItemsError;

      const itemsToInsert = (importedItems || [])
        .filter((it: any) => !!it.produto_id)
        .map((it: any) => ({
          account_payable_id: payable.id,
          product_id: it.produto_id,
          quantity: it.quantidade,
          unit_price: it.valor_unitario,
          total_price: it.valor_total,
          store_id: storeId,
        }));

      if (itemsToInsert.length === 0) {
        // Rollback: a conta sem itens não faz sentido para uma NF-e
        await supabase.from("accounts_payable").delete().eq("id", payable.id);
        throw new Error("Nenhum item vinculado a produto foi encontrado para esta importação. Vincule os produtos antes de gerar o Contas a Pagar.");
      }

      const { error: insertItemsError } = await supabase
        .from("accounts_payable_items")
        .insert(itemsToInsert as any);
      if (insertItemsError) {
        await supabase.from("accounts_payable").delete().eq("id", payable.id);
        throw insertItemsError;
      }

      await supabaseAny.from("nfe_importacoes").update({ status: "contas_pagar_gerado", contas_pagar_id: payable.id }).eq("id", id);

      // Pré-popular parcelas a partir das duplicatas, se existirem
      const dups = cabecalho.duplicatas || [];
      const initial: Parcela[] = dups.length
        ? dups.map((d, i) => ({ installment_number: i + 1, due_date: toIsoDate(d.vencimento) || apDueDate, amount: d.valor }))
        : [{ installment_number: 1, due_date: apDueDate, amount: totalAmount }];
      setCreatedPayableId(payable.id);
      setCreatedPayableAmount(totalAmount);
      setNumberOfInstallments(initial.length);
      setInstallments(initial);
      setShowApDialog(false);
      setShowInstallmentsModal(true);
      toast({ title: "Contas a Pagar gerado", description: "Configure as parcelas." });
      fetchHistorico();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao gerar Contas a Pagar", description: error.message });
    } finally {
      setGenerating(false);
    }
  };

  const generateInstallmentsLocal = () => {
    const total = createdPayableAmount;
    const base = Number((total / numberOfInstallments).toFixed(2));
    const startDate = new Date(apDueDate + "T12:00:00");
    const list: Parcela[] = [];
    for (let i = 1; i <= numberOfInstallments; i++) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + (i - 1));
      list.push({
        installment_number: i,
        due_date: d.toISOString().slice(0, 10),
        amount: i === numberOfInstallments ? Number((total - base * (numberOfInstallments - 1)).toFixed(2)) : base,
      });
    }
    setInstallments(list);
  };

  const updateInstallment = (idx: number, field: keyof Parcela, value: string | number) => {
    setInstallments((cur) => cur.map((it, i) => i === idx ? { ...it, [field]: field === "amount" ? Number(value) : value } : it));
  };

  const confirmInstallments = async () => {
    if (!createdPayableId) return;
    const sum = installments.reduce((s, i) => s + i.amount, 0);
    if (Math.abs(sum - createdPayableAmount) > 0.01) {
      toast({ variant: "destructive", title: "Soma inválida", description: `Soma das parcelas (${formatCurrency(sum)}) difere do total (${formatCurrency(createdPayableAmount)}).` });
      return;
    }
    try {
      await supabase.from("accounts_payable_installments").delete().eq("account_payable_id", createdPayableId);
      const rows = installments.map((p) => ({
        account_payable_id: createdPayableId,
        installment_number: p.installment_number,
        due_date: p.due_date,
        amount: p.amount,
      }));
      const { error } = await supabase.from("accounts_payable_installments").insert(rows);
      if (error) throw error;
      // Se aberto via Controle de Caixa (modo embedded com despesa), vincula a despesa
      // ao Contas a Pagar gerado e notifica o pai para fechar o iframe.
      if (linkExpenseId && createdPayableId) {
        const { error: linkError } = await supabase
          .from("cash_control_expenses")
          .update({ linked_account_payable_id: createdPayableId })
          .eq("id", linkExpenseId);
        if (linkError) {
          console.error("Erro ao vincular despesa ao Contas a Pagar:", linkError);
          toast({ variant: "destructive", title: "Vínculo não realizado", description: linkError.message });
        } else {
          toast({ title: "Despesa vinculada ao Contas a Pagar" });
        }
      } else {
        toast({ title: "Parcelas salvas" });
      }
      setShowInstallmentsModal(false);
      // Limpar tela após sucesso
      setCabecalho(null); setItens([]); setFile(null); setImportacaoId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // No modo embedded, avisa o pai para fechar o modal/iframe
      if (embedded && typeof window !== "undefined" && window.parent !== window) {
        try {
          window.parent.postMessage({ type: "nfe-import-done", linkExpenseId, payableId: createdPayableId }, "*");
        } catch (e) {
          console.error("postMessage falhou", e);
        }
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar parcelas", description: e.message });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Importação de NF-e</h1>
            <p className="text-sm text-muted-foreground">Envie o PDF da nota fiscal eletrônica para conferir os itens e vincular aos produtos cadastrados.</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar NF-e</CardTitle>
            <CardDescription>Busque pela chave de acesso ou selecione o DANFE em PDF para leitura.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Chave de acesso da NF-e</Label>
                <Input
                  inputMode="numeric"
                  maxLength={44}
                  placeholder="Digite os 44 dígitos da chave"
                  value={accessKey}
                  onChange={(event) => setAccessKey(event.target.value.replace(/\D/g, "").slice(0, 44))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleFetchByAccessKey();
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleFetchByAccessKey} disabled={fetchingAccessKey || reading} className="w-full lg:w-auto">
                  {fetchingAccessKey ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSearch className="h-4 w-4 mr-2" />}
                  Buscar e importar
                </Button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>XML ou DANFE em PDF</Label>
                <Input ref={fileInputRef} type="file" accept=".xml,application/xml,text/xml,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </div>
              <div className="flex items-end">
                <Button onClick={handleReadPdf} disabled={reading || fetchingAccessKey} variant="outline" className="w-full lg:w-auto">
                  {reading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Ler arquivo
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{status}</div>
          </CardContent>
        </Card>

        {cabecalho && (
          <Card>
            <CardHeader>
              <CardTitle>Dados da Nota</CardTitle>
              <CardDescription>Confira o cabeçalho extraído do PDF.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Info label="Fornecedor" value={fornecedor?.name || cabecalho.fornecedor || "Não localizado"} />
              <Info label="CNPJ" value={cabecalho.cnpj_fornecedor} />
              <Info label="NF-e" value={cabecalho.numero_nfe} />
              <Info label="Série" value={cabecalho.serie} />
              <Info label="Chave de acesso" value={cabecalho.chave_acesso} className="lg:col-span-2" />
              <Info label="Emissão" value={cabecalho.data_emissao} />
              <Info label="Valor total" value={formatCurrency(cabecalho.valor_total_nota)} />
              <div className="space-y-2">
                <Label>Loja/Empresa</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{lojas.map((loja) => <SelectItem key={loja.id} value={loja.id}>{loja.code ? `${loja.code} - ` : ""}{loja.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Info label="Vencimento" value={cabecalho.duplicatas.map((d) => `${d.parcela} ${d.vencimento} ${formatCurrency(d.valor)}`).join(" | ") || "Não encontrado"} className="lg:col-span-3" />
            </CardContent>
          </Card>
        )}

        {itens.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Itens da Nota</CardTitle>
              <CardDescription>{itens.length} itens encontrados. {vinculados} vinculados automaticamente. {itens.length - vinculados} aguardando correlação.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código Fornecedor</TableHead>
                      <TableHead className="min-w-[280px]">Produto na NF-e</TableHead>
                      <TableHead className="min-w-[260px]">Produto no Sistema</TableHead>
                      <TableHead>Ações</TableHead>
                      <TableHead>Unid.</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Valor Unit.</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item, index) => (
                      <TableRow key={`${item.codigo_fornecedor}-${index}`} className={item.status_vinculo !== "vinculado" ? "bg-amber-50" : undefined}>
                        <TableCell className="font-mono">{item.codigo_fornecedor}</TableCell>
                        <TableCell>{item.descricao_limpa}</TableCell>
                        <TableCell>
                          <Popover
                            open={productPopoverOpen === index}
                            onOpenChange={(o) => setProductPopoverOpen(o ? index : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button variant="outline" role="combobox" className="w-[260px] justify-between font-normal">
                                <span className="truncate text-left">
                                  {item.produto_id
                                    ? (produtos.find((p) => p.id === item.produto_id)?.name || "Selecionar produto")
                                    : "Selecionar produto"}
                                </span>
                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[320px] p-0 z-[9999] pointer-events-auto"
                              align="start"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <Command>
                                <CommandInput placeholder="Digite parte do nome..." />
                                <CommandList>
                                  <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                                  <CommandGroup>
                                    {produtos.map((p) => (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.code || ""} ${p.name}`}
                                        onSelect={() => {
                                          handleProductChange(index, p.id);
                                          setProductPopoverOpen(null);
                                        }}
                                      >
                                        <div className="flex flex-col">
                                          <span className="font-medium">{p.name}</span>
                                          <span className="text-xs text-muted-foreground">Cód: {p.code}</span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {item.produto_id && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <Checkbox checked={!!item.salvar_vinculo} onCheckedChange={(checked) => setItens((current) => current.map((row, i) => i === index ? { ...row, salvar_vinculo: checked === true } : row))} />
                              Salvar vínculo para próximas importações
                            </label>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => openQuickProduct(index)} title="Cadastro rápido"><Plus className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => removeItem(index)} title="Excluir linha"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                          </div>
                        </TableCell>
                        <TableCell>{item.unidade}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.0001"
                            value={item.quantidade}
                            onChange={(e) => updateItemField(index, { quantidade: Number(e.target.value) })}
                            className="w-24 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.0001"
                            value={item.valor_unitario}
                            onChange={(e) => updateItemField(index, { valor_unitario: Number(e.target.value) })}
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.valor_total}
                            onChange={(e) => setItens((current) => current.map((row, i) => i === index ? { ...row, valor_total: Number(e.target.value) } : row))}
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell><StatusBadge status={item.status_vinculo} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div>
                <Button variant="outline" size="sm" onClick={addEmptyItem}>
                  <Plus className="h-4 w-4 mr-2" /> Inserir nova linha
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-4 text-sm">
                <Summary label="Total de itens" value={String(itens.length)} />
                <Summary label="Total dos produtos" value={formatCurrency(totalProdutos)} />
                <Summary label="Total da nota" value={formatCurrency(cabecalho?.valor_total_nota)} />
                <Summary label="Diferença" value={formatCurrency(diferenca)} warning={Math.abs(diferenca) > 0.05} />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => { setCabecalho(null); setItens([]); setFile(null); fileInputRef.current && (fileInputRef.current.value = ""); }}>Cancelar</Button>
                <Button onClick={async () => { const id = await saveImport(); if (id) fetchHistorico(); }} disabled={saving}><Save className="h-4 w-4 mr-2" /> Salvar Importação</Button>
                <Button onClick={generateAccountsPayable} disabled={saving || generating}><WalletCards className="h-4 w-4 mr-2" /> Gerar Contas a Pagar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de NF-e Importadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> NF-e Importadas</CardTitle>
            <CardDescription>Histórico de notas importadas. Pode-se excluir importações sem Contas a Pagar vinculado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Loja</Label>
                <Select value={histLoja} onValueChange={setHistLoja}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.code ? `${l.code} - ` : ""}{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Importado de</Label>
                <Input type="date" value={histDataIni} onChange={(e) => setHistDataIni(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Importado até</Label>
                <Input type="date" value={histDataFim} onChange={(e) => setHistDataFim(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={fetchHistorico} disabled={loadingHistorico}>
                  {loadingHistorico ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  Atualizar
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Importado em</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>NF-e</TableHead>
                    <TableHead>Série</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhuma importação encontrada.</TableCell></TableRow>
                  )}
                  {historico.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell>{new Date(imp.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{imp.store_name || "-"}</TableCell>
                      <TableCell className="font-mono">{imp.numero_nfe || "-"}</TableCell>
                      <TableCell>{imp.serie || "-"}</TableCell>
                      <TableCell>{imp.fornecedor_nome || "-"}</TableCell>
                      <TableCell>{imp.data_emissao ? new Date(imp.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(imp.valor_total_nota || 0)}</TableCell>
                      <TableCell>
                        {imp.contas_pagar_id
                          ? <Badge className="bg-green-600 hover:bg-green-600">Contas a Pagar</Badge>
                          : <Badge variant="secondary">{imp.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!imp.contas_pagar_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reloadImportacaoForRegenerate(imp)}
                              title="Gerar Contas a Pagar novamente"
                            >
                              <RefreshCw className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteImportacao(imp)}
                            disabled={!!imp.contas_pagar_id}
                            title={imp.contas_pagar_id ? "Possui Contas a Pagar vinculado" : "Excluir importação"}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={quickIndex !== null} onOpenChange={(open) => !open && setQuickIndex(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastro rápido de produto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome/descrição</Label>
              <Input value={quickData.name} onChange={(e) => setQuickData({ ...quickData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={quickData.unit_id} onValueChange={(unit_id) => setQuickData({ ...quickData, unit_id })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.symbol} - {u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {quickIndex !== null && <p className="text-sm text-muted-foreground">Fornecedor: {fornecedor?.name || "não localizado"} | Código: {itens[quickIndex]?.codigo_fornecedor} | Último valor: {formatCurrency(itens[quickIndex]?.valor_unitario, 4)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickIndex(null)}>Cancelar</Button>
            <Button onClick={saveQuickProduct}><CheckCircle2 className="h-4 w-4 mr-2" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal pré-Contas a Pagar */}
      <Dialog open={showApDialog} onOpenChange={setShowApDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar Contas a Pagar</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo do Documento *</Label>
              <Select value={apDocType} onValueChange={setApDocType}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((t) => <SelectItem key={t.id} value={t.code}>{t.name} ({t.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Data de Emissão *</Label>
                <Input type="date" value={apIssueDate} onChange={(e) => setApIssueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Competência *</Label>
                <Input type="date" value={apCompetenceDate} onChange={(e) => setApCompetenceDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento *</Label>
                <Input type="date" value={apDueDate} onChange={(e) => setApDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApDialog(false)}>Cancelar</Button>
            <Button onClick={confirmGenerateAp} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WalletCards className="h-4 w-4 mr-2" />}
              Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de parcelas */}
      <Dialog open={showInstallmentsModal} onOpenChange={setShowInstallmentsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Configurar Parcelas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-2">
                <Label>Quantidade de Parcelas</Label>
                <Input type="number" min={1} value={numberOfInstallments} onChange={(e) => setNumberOfInstallments(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <Button variant="outline" onClick={generateInstallmentsLocal}>Gerar Parcelas</Button>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                Total da nota: <span className="font-semibold text-foreground">{formatCurrency(createdPayableAmount)}</span>
              </div>
            </div>

            {installments.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installments.map((inst, i) => (
                      <TableRow key={i}>
                        <TableCell>{inst.installment_number}ª</TableCell>
                        <TableCell>
                          <Input type="date" value={inst.due_date} onChange={(e) => updateInstallment(i, "due_date", e.target.value)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.01" value={inst.amount} onChange={(e) => updateInstallment(i, "amount", e.target.value)} className="text-right" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="text-right mt-2 text-sm">
                  Soma: <span className="font-semibold">{formatCurrency(installments.reduce((s, i) => s + i.amount, 0))}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstallmentsModal(false)}>Fechar</Button>
            <Button onClick={confirmInstallments}><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar Parcelas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function findSupplier(cnpj?: string, name?: string): Promise<Fornecedor | null> {
  if (cnpj) {
    const digits = cnpj.replace(/\D/g, "");
    const { data: formatted } = await supabase.from("suppliers").select("id, name, cnpj_cpf").eq("cnpj_cpf", cnpj).maybeSingle();
    if (formatted) return formatted as Fornecedor;
    const { data: onlyDigits } = await supabase.from("suppliers").select("id, name, cnpj_cpf").eq("cnpj_cpf", digits).maybeSingle();
    if (onlyDigits) return onlyDigits as Fornecedor;
  }
  if (name) {
    const { data } = await supabase.from("suppliers").select("id, name, cnpj_cpf").ilike("name", `%${name.slice(0, 20)}%`).maybeSingle();
    if (data) return data as Fornecedor;
  }
  return null;
}

async function correlateItems(items: NfeItemImportado[], supplierId: string | undefined, products: Produto[]): Promise<ItemConferencia[]> {
  if (!supplierId) return items.map((item) => ({ ...item, status_vinculo: "nao_vinculado" }));
  const { data: codes } = await supabase
    .from("product_supplier_codes")
    .select("supplier_code, product_id")
    .eq("supplier_id", supplierId)
    .in("supplier_code", items.map((item) => item.codigo_fornecedor));

  return items.map((item) => {
    const link = codes?.find((code) => code.supplier_code === item.codigo_fornecedor);
    const product = link ? products.find((p) => p.id === link.product_id) : undefined;
    return {
      ...item,
      produto_id: product?.id,
      produto_nome: product?.name,
      status_vinculo: product ? "vinculado" : "nao_vinculado",
    };
  });
}

function Info({ label, value, className = "" }: { label: string; value?: string | number; className?: string }) {
  return <div className={className}><div className="text-xs font-medium text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value || "-"}</div></div>;
}

function Summary({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-md border p-3 ${warning ? "border-red-200 bg-red-50" : "bg-muted/30"}`}><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}

function StatusBadge({ status }: { status: ItemConferencia["status_vinculo"] }) {
  if (status === "vinculado") return <Badge className="bg-green-600 hover:bg-green-600">Vinculado</Badge>;
  if (status === "erro") return <Badge variant="destructive">Erro</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500">Não vinculado</Badge>;
}

function formatCurrency(value?: number, maximumFractionDigits = 2) {
  return typeof value === "number" ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits }) : "-";
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits });
}

function toIsoDate(value?: string) {
  if (!value) return null;
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function competenceFromDate(value?: string) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 7) + "-01" : null;
}

async function uploadPdfIfPossible(file: File | null, storeId: string, chave?: string) {
  if (!file || !chave) return null;
  const isXml = isXmlFile(file);
  const ext = isXml ? "xml" : "pdf";
  const contentType = isXml ? "application/xml" : "application/pdf";
  const filePath = `${storeId}/nfe/${chave}.${ext}`;
  const { error } = await supabase.storage.from("account-documents").upload(filePath, file, {
    contentType,
    upsert: true,
  });
  return error ? null : filePath;
}

function isXmlFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xml")) return true;
  const type = (file.type || "").toLowerCase();
  return type.includes("xml");
}

function base64ToPdfFile(base64: string, fileName: string) {
  const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, "").replace(/^"|"$/g, "");
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, {
    type: "application/pdf",
  });
}

function isNfeAccessKeyValid(accessKey: string) {
  if (!/^\d{44}$/.test(accessKey)) return false;
  if (accessKey.slice(20, 22) !== "55") return false;

  const body = accessKey.slice(0, 43);
  const digit = Number(accessKey.slice(43));
  let weight = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const expected = mod === 0 || mod === 1 ? 0 : 11 - mod;
  return digit === expected;
}

function getEdgeFunctionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Nao foi possivel buscar a NF-e no Meu Danfe.";
  }

  const message = error.message || "";

  if (message.includes("Failed to send a request to edge function")) {
    return "A integracao de consulta ainda nao esta disponivel no Supabase deste ambiente. Publique a Edge Function `meudanfe-fetch-nfe` e configure o secret `MEUDANFE_API_KEY`.";
  }

  if (message.includes("FunctionsFetchError")) {
    return "Nao foi possivel acessar a Edge Function de consulta. Verifique se ela foi publicada no projeto Supabase.";
  }

  return message;
}
