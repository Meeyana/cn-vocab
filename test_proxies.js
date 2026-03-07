import axios from 'axios';

async function testProxy() {
    const word = encodeURIComponent('hello');
    const hanziiUrl = `https://api.hanzii.net/api/v3/search/vi/${word}?type=word&page=1&limit=24`;

    // Proxy URLs to test
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(hanziiUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(hanziiUrl)}`
    ];

    for (const url of proxies) {
        console.log(`Testing proxy: ${url}`);
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
                },
                timeout: 5000
            });
            console.log(`SUCCESS with ${url}. Status: ${res.status}`);
            console.log(`Sample Data:`, String(res.data).substring(0, 50));
        } catch (e) {
            console.error(`FAILED with ${url}. Error: ${e.message}`);
            if (e.response) {
                console.error(`Status: ${e.response.status}`);
            }
        }
        console.log('---');
    }
}

testProxy();
