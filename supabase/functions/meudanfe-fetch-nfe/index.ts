import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MEUDANFE_API_URL = "https://api.meudanfe.com.br/v2";
const POLL_INTERVAL_MS = 1200;
const MAX_ATTEMPTS = 20;

type MeuDanfeStatus = "WAITING" | "SEARCHING" | "NOT_FOUND" | "OK" | "ERROR";

type MeuDanfeAddResponse = {
  value?: string;
  type?: "NFE" | "CTE";
  status?: MeuDanfeStatus;
  statusMessage?: string;
};

type MeuDanfeDownloadResponse = {
  name?: string;
  type?: "NFE" | "CTE";
  format?: "BASE64" | "XML";
  data?: string;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Metodo nao permitido" }, 405);
    }

    const apiKey = Deno.env.get("MEUDANFE_API_KEY");
    if (!apiKey) {
      return json({ error: "MEUDANFE_API_KEY nao configurada na Edge Function" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Usuario nao autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Usuario nao autenticado" }, 401);
    }

    const { data: canWriteFinanceiro, error: permissionError } = await supabaseUser.rpc("user_has_permission", {
      module_name: "financeiro",
      required_permission: "write",
    });
    if (permissionError || !canWriteFinanceiro) {
      return json({ error: "Usuario sem permissao para importar NF-e" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const accessKey = String(body.accessKey || "").replace(/\D/g, "");
    if (!isAccessKeyValid(accessKey)) {
      return json({ error: "Chave de acesso da NF-e invalida" }, 400);
    }

    const cachedPdf = await downloadDanfe(accessKey, apiKey);
    const cachedXml = await downloadXml(accessKey, apiKey);
    if (cachedXml.ok || cachedPdf.ok) {
      return json({
        accessKey,
        xml: cachedXml.ok ? (cachedXml.data?.data ?? null) : null,
        xmlName: cachedXml.ok ? (cachedXml.data?.name ?? null) : null,
        ...(cachedPdf.ok ? cachedPdf.data : {}),
      });
    }
    if (cachedPdf.status !== 404 && cachedXml.status !== 404) {
      throw new Error(cachedPdf.message || cachedXml.message || "Falha ao consultar NF-e no Meu Danfe");
    }

    let lastStatus = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const addResult = await addOrPollAccessKey(accessKey, apiKey);
      lastStatus = addResult.status || "";

      if (addResult.status === "OK") {
        const [pdf, xml] = await Promise.all([
          downloadDanfe(accessKey, apiKey),
          downloadXml(accessKey, apiKey),
        ]);
        if (!pdf.ok && !xml.ok) {
          throw new Error(pdf.message || xml.message || "NF-e localizada, mas nem o XML nem o PDF foram retornados");
        }
        return json({
          accessKey,
          xml: xml.ok ? (xml.data?.data ?? null) : null,
          xmlName: xml.ok ? (xml.data?.name ?? null) : null,
          ...(pdf.ok ? pdf.data : {}),
        });
      }

      if (addResult.status === "NOT_FOUND") {
        return json({ error: "NF-e nao encontrada pelo Meu Danfe" }, 404);
      }

      if (addResult.status === "ERROR") {
        throw new Error(addResult.statusMessage || "Meu Danfe retornou erro ao consultar a NF-e");
      }

      if (attempt < MAX_ATTEMPTS) {
        await sleep(POLL_INTERVAL_MS);
      }
    }

    return json({
      error: `Consulta ainda em processamento no Meu Danfe (${lastStatus || "sem status"}). Tente novamente em alguns instantes.`,
    }, 504);
  } catch (error: unknown) {
    console.error("meudanfe-fetch-nfe error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao buscar NF-e no Meu Danfe" }, 500);
  }
});

async function addOrPollAccessKey(accessKey: string, apiKey: string): Promise<MeuDanfeAddResponse> {
  const response = await fetch(`${MEUDANFE_API_URL}/fd/add/${accessKey}`, {
    method: "PUT",
    headers: { "Api-Key": apiKey },
  });

  if (!response.ok) {
    throw new Error(await meudanfeErrorMessage(response));
  }

  return await response.json();
}

async function downloadDanfe(accessKey: string, apiKey: string) {
  const response = await fetch(`${MEUDANFE_API_URL}/fd/get/da/${accessKey}`, {
    method: "GET",
    headers: { "Api-Key": apiKey },
  });

  if (response.status === 404) {
    return { ok: false, status: response.status };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, message: await meudanfeErrorMessage(response) };
  }

  const data = await response.json() as MeuDanfeDownloadResponse;
  if (!data.data) {
    return { ok: false, status: 500, message: "Resposta do Meu Danfe sem PDF em base64" };
  }

  return { ok: true, status: response.status, data };
}

async function downloadXml(accessKey: string, apiKey: string) {
  const response = await fetch(`${MEUDANFE_API_URL}/fd/get/xml/${accessKey}`, {
    method: "GET",
    headers: { "Api-Key": apiKey },
  });

  if (response.status === 404) {
    return { ok: false as const, status: response.status };
  }

  if (!response.ok) {
    return { ok: false as const, status: response.status, message: await meudanfeErrorMessage(response) };
  }

  const data = await response.json() as MeuDanfeDownloadResponse;
  if (!data.data) {
    return { ok: false as const, status: 500, message: "Resposta do Meu Danfe sem XML" };
  }

  return { ok: true as const, status: response.status, data };
}

async function meudanfeErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `Meu Danfe retornou HTTP ${response.status}`;
  try {
    const jsonBody = JSON.parse(text);
    return jsonBody.message || jsonBody.error || jsonBody.statusMessage || `Meu Danfe retornou HTTP ${response.status}`;
  } catch {
    return text;
  }
}

function isAccessKeyValid(accessKey: string) {
  if (!/^\d{44}$/.test(accessKey)) return false;
  const model = accessKey.slice(20, 22);
  if (model !== "55") return false;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
