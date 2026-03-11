export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        // ==========================================
        // 1. API GỢI Ý (AUTOCOMPLETE)
        // ==========================================
        if (action === "suggest") {
            const keyword = url.searchParams.get("keyword");
            if (!keyword) {
                return new Response(JSON.stringify({ error: "Missing 'keyword' parameter" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            const suggestUrl = "https://suggest.hanzii.net/api/suggest";
            try {
                const response = await fetch(suggestUrl, {
                    method: 'POST',
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "content-type": "application/json",
                        "origin": "https://hanzii.net",
                        "referer": "https://hanzii.net/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
                    },
                    body: JSON.stringify({ keyword: keyword, dict: "cnvi" })
                });

                const data = await response.json();
                return new Response(JSON.stringify(data), {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type"
                    }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: "Cloudflare Worker suggest failed", details: error.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }
        }

        // ==========================================
        // 2. API TÌM KIẾM CHÍNH (MẶC ĐỊNH)
        // ==========================================
        const word = url.searchParams.get("word");
        const type = url.searchParams.get("type") || "word";

        if (!word) {
            return new Response(JSON.stringify({ error: "Missing 'word' parameter" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        const encodedWord = encodeURIComponent(word);
        const hanziiUrl = `https://api.hanzii.net/api/v3/search/vi/${encodedWord}?type=${type}&page=1&limit=24`;

        try {
            const response = await fetch(hanziiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                }
            });

            const data = await response.json();
            return new Response(JSON.stringify(data), {
                status: response.status,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: "Cloudflare Worker fetch failed", details: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }
    }
};
