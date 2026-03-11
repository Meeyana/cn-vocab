const axios = require('axios');
const CryptoJS = require('crypto-js');

// ==========================================
// HANZII DECRYPTION LOGIC
// ==========================================
const rawSecretKey = "I2F6a0dYSRcybhgOVA9aM1o+ByE4GAd+Vx4MMzQWH2cDCgFlWzYWGE5bHEBRAHNSXys7Jjl/XFFSFmQaBhUJPzU0H0tdaBABMR4MBx0eBkgNHFAfBwd7GlRFAFw6UQYlMBobBg==";
const SVL_STRING = "myPepper123";

function decodeSecret(base64Str, xorStr) {
    const rawBytes = Buffer.from(base64Str, 'base64');
    rawBytes.reverse();
    const xorBytes = Buffer.from(xorStr, 'utf-8');

    for (let i = 0; i < rawBytes.length; i++) {
        rawBytes[i] = rawBytes[i] ^ xorBytes[i % xorBytes.length];
    }
    return rawBytes.toString('utf-8');
}

function decryptHanziiData(encryptedData) {
    try {
        const decodedSecretString = decodeSecret(rawSecretKey, SVL_STRING);
        const AES_KEY = CryptoJS.SHA256(decodedSecretString);
        const hexData = CryptoJS.enc.Hex.parse(CryptoJS.enc.Base64.parse(encryptedData).toString(CryptoJS.enc.Hex));

        const iv = CryptoJS.lib.WordArray.create(hexData.words.slice(0, 4), 16);
        const ciphertextWords = CryptoJS.lib.WordArray.create(hexData.words.slice(4), hexData.sigBytes - 16);

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: ciphertextWords },
            AES_KEY,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const resultText = decrypted.toString(CryptoJS.enc.Utf8);
        return JSON.parse(resultText);
    } catch (error) {
        console.error("Decryption Error:", error.message);
        throw error;
    }
}

// ==========================================
// NETLIFY FUNCTION HANDLER
// ==========================================
exports.handler = async (event, context) => {
    // Chỉ cho phép phương thức GET
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const word = event.queryStringParameters.word;

    if (!word) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'word' query parameter" })
        };
    }

    try {
        // 1. GỌI QUA CLOUDFLARE WORKER (PROXY TRUNG GIAN DÙNG ĐỂ FAKE IP) VỚI type=grammar
        const encodedWord = encodeURIComponent(word);
        const cloudflareUrl = `https://hanzii-proxy.tuanphan1112-working.workers.dev/?word=${encodedWord}&type=grammar`;

        const response = await axios.get(cloudflareUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        const encryptedData = response.data.data;
        if (!encryptedData) throw new Error("Không lấy được dữ liệu mã hóa");

        const decryptedJson = decryptHanziiData(String(encryptedData));

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*", // CORS cho Netlify
            },
            body: JSON.stringify(decryptedJson)
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                msg: "Lỗi tại Function Grammar rồi bạn ơi!",
                error: error.message,
                axiosStatus: error.response ? error.response.status : null,
                axiosData: error.response ? error.response.data : null,
                stack: error.stack
            })
        };
    }
};
