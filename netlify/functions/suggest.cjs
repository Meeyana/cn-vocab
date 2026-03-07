const axios = require('axios');

exports.handler = async (event) => {
    const keyword = event.queryStringParameters.keyword;

    if (!keyword) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'keyword' query parameter" })
        };
    }

    try {
        // GỌI QUA CLOUDFLARE WORKER ĐỂ FAKE IP (Thay vì gọi trực tiếp Hanzii)
        // Chúng ta gọi GET tới Worker, Worker sẽ dùng POST để lấy dữ liệu từ Hanzii Suggest
        const cloudflareUrl = `https://hanzii-proxy.tuanphan1112-working.workers.dev/?action=suggest&keyword=${encodeURIComponent(keyword)}`;

        const response = await axios.get(cloudflareUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(response.data)
        };
    } catch (error) {
        console.error("Suggest API Error:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Suggest API failed",
                details: error.message
            })
        };
    }
};
