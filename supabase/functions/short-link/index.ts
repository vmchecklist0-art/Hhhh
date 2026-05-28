import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

function generateSlug(length = 6): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"
  let slug = ""
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  for (const b of bytes) slug += chars[b % chars.length]
  return slug
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const url = new URL(req.url)

  // POST /short-link — create a new short link
  if (req.method === "POST") {
    try {
      const { longUrl, origin: clientOrigin } = await req.json() as { longUrl?: string; origin?: string }
      if (!longUrl || !longUrl.startsWith("http")) {
        return new Response(JSON.stringify({ error: "Invalid URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Try up to 5 times to get a unique slug
      let slug = ""
      for (let i = 0; i < 5; i++) {
        const candidate = generateSlug(6)
        const { data } = await supabase
          .from("short_links")
          .select("slug")
          .eq("slug", candidate)
          .maybeSingle()
        if (!data) { slug = candidate; break }
      }

      if (!slug) {
        return new Response(JSON.stringify({ error: "Could not generate unique slug" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { error } = await supabase
        .from("short_links")
        .insert({ slug, long_url: longUrl })

      if (error) throw error

      const origin = clientOrigin ?? Deno.env.get("SITE_URL") ?? url.origin

      return new Response(JSON.stringify({ slug, shortUrl: `${origin}/s/${slug}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  // GET /short-link?slug=xxx — resolve a slug to its long URL
  if (req.method === "GET") {
    const slug = url.searchParams.get("slug")
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data, error } = await supabase
      .from("short_links")
      .select("long_url")
      .eq("slug", slug)
      .maybeSingle()

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ longUrl: data.long_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
