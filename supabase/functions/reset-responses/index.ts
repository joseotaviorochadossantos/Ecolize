const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function matchesSecret(provided: string, expected: string) {
  const providedBytes = new TextEncoder().encode(provided);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = providedBytes.length === expectedBytes.length ? 0 : 1;

  for (let index = 0; index < Math.max(providedBytes.length, expectedBytes.length); index += 1) {
    difference |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const adminPassword = Deno.env.get('ADMIN_RESET_PASSWORD');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!adminPassword || adminPassword.length < 16 || !supabaseUrl || !serviceRoleKey) {
    console.error('Configure ADMIN_RESET_PASSWORD (com pelo menos 16 caracteres) e as credenciais do Supabase.');
    return jsonResponse({ error: 'O reset administrativo ainda não está configurado no Supabase.' }, 500);
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Requisição inválida.' }, 400);
  }

  if (typeof body.password !== 'string' || body.password.length > 256 || !matchesSecret(body.password, adminPassword)) {
    return jsonResponse({ error: 'Senha administrativa incorreta.' }, 401);
  }

  const deleteUrl = new URL('/rest/v1/availability_responses', supabaseUrl);
  deleteUrl.searchParams.set('id', 'not.is.null');

  const deleteResponse = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal'
    }
  });

  if (!deleteResponse.ok) {
    console.error('Falha ao apagar respostas:', deleteResponse.status, await deleteResponse.text());
    return jsonResponse({ error: 'O Supabase não conseguiu apagar as respostas.' }, 502);
  }

  return jsonResponse({ message: 'Respostas apagadas.' }, 200);
});
