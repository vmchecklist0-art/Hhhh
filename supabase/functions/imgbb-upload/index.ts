import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const imgbbKey = Deno.env.get("IMGBB_API_KEY");
    if (!imgbbKey) {
      return new Response(
        JSON.stringify({ error: "ImgBB API key not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") ?? "";

    let base64Image: string;
    let filename: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      base64Image = body.image;
      filename = body.name;
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image") as File | null;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No image provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      filename = file.name;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      base64Image = btoa(binary);
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported content type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams();
    params.append("image", base64Image);
    if (filename) params.append("name", filename);

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const payload = await imgbbRes.json().catch(() => null);
    if (!imgbbRes.ok || !payload?.success) {
      return new Response(
        JSON.stringify({ error: payload?.error?.message ?? payload?.error ?? "Upload failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageUrl = payload.data?.url;
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Upload succeeded but no URL returned" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url: imageUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
