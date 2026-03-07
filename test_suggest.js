async function testSuggest() {
    try {
        const response = await fetch("https://suggest.hanzii.net/api/suggest", {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "origin": "https://hanzii.net",
                "referer": "https://hanzii.net/"
            },
            body: JSON.stringify({ keyword: "nihao", dict: "cnvi" })
        });
        const data = await response.json();
        console.log("Gọi API thành công!");
        console.log("Dữ liệu trả về:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Lỗi khi gọi API:", error);
    }
}

testSuggest();
