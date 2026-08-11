// api/scan.js
export default async function handler(req, res) {
    // Zabezpieczenie przed niewłaściwymi zapytaniami
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Dozwolone tylko zapytania POST.' });
    }

    const { base64Image, mimeType } = req.body;
    
    // Serwer Vercel bezpiecznie pobiera Twój klucz ze zmiennych środowiskowych
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Błąd konfiguracji serwera: Brak klucza API.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const promptText = `Przeanalizuj to zdjęcie faktury z hurtowni stolarskiej. 
    Wypisz wszystkie pozycje materiałowe oraz ich ostateczne ceny brutto. 
    MUSISZ zwrócić wynik w formacie JSON jako tablicę obiektów.
    Wymagany format: [{"name": "nazwa materiału", "price": 12.34}]`;

    const payload = {
        contents: [{ parts: [
            { text: promptText }, 
            { inlineData: { mimeType: mimeType, data: base64Image } }
        ]}],
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const response = await fetch(apiUrl, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        });
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        // Zwracamy odpowiedź z powrotem do Twojej aplikacji
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}