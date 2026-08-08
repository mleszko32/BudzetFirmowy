import './style.css';
// 1. Importujemy niezbędne funkcje z paczki Firebase
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";

// 2. Wklej tutaj swój skopiowany z Firebase config (ZAMIEŃ PONIŻSZY OBIEKT NA SWÓJ!)
const firebaseConfig = {
  apiKey: "AIzaSyCSE0dGsBBWkzV1Ceuw9GeMJB520UvVHaY",
  authDomain: "budzetfirmowy-3dd46.firebaseapp.com",
  projectId: "budzetfirmowy-3dd46",
  storageBucket: "budzetfirmowy-3dd46.firebasestorage.app",
  messagingSenderId: "725951455675",
  appId: "1:725951455675:web:9d53f510f78f008af7e49e"
};


// 3. Uruchamiamy aplikację Firebase i łączymy się z bazą danych Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Pobieramy elementy z naszego HTML-a
const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseCostInput = document.getElementById('expense-cost');
const expenseListContainer = document.getElementById('expense-list-container');
const totalExpensesEl = document.getElementById('total-expenses');
const currentBalanceEl = document.getElementById('current-balance');

// Na razie kwotę zaliczki zostawiamy stałą, żeby testować wydatki
let deposit = 4000; 

// Wskazujemy miejsce w bazie, gdzie chcemy zapisywać i czytać wydatki
// Tworzymy ścieżkę: projekty -> kowalski -> wydatki
const expensesRef = collection(db, "projects", "kowalski", "expenses");
const expensesQuery = query(expensesRef, orderBy("createdAt", "desc"));

// 4. "Słuchacz" bazy danych - uruchamia się przy starcie i za każdym razem, gdy dodasz wydatek
onSnapshot(expensesQuery, (snapshot) => {
    // Czyścimy starą listę przed nałożeniem nowych danych
    expenseListContainer.innerHTML = ''; 
    let totalSum = 0;

    snapshot.forEach((doc) => {
        const data = doc.data();
        totalSum += data.cost;

        // Zamiana magicznej daty Firebase na czytelny polski format
        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        const dateStr = dateObj.toLocaleDateString('pl-PL');

        const newExpenseItem = document.createElement('li');
        newExpenseItem.classList.add('expense-item');
        
        newExpenseItem.innerHTML = `
            <div class="expense-info">
                <strong>${data.name}</strong>
                <span class="expense-date">${dateStr}</span>
            </div>
            <span class="expense-amount text-red">- ${data.cost.toFixed(2)} zł</span>
        `;

        // Dodajemy na koniec (zapytanie Firebase z orderBy("desc") układa od najnowszych)
        expenseListContainer.appendChild(newExpenseItem);
    });

    // Aktualizujemy kafelki finansowe nową sumą prosto z chmury
    totalExpensesEl.textContent = `${totalSum.toFixed(2)} zł`;
    const balance = deposit - totalSum;
    currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;
});

// 5. Wysyłanie nowego wydatku do bazy danych
expenseForm.addEventListener('submit', async function(event) {
    event.preventDefault(); 

    const name = expenseNameInput.value;
    const cost = parseFloat(expenseCostInput.value);

    // Zapobiegamy przypadkowemu dodaniu pustych wartości
    if (!name || isNaN(cost)) return;

    try {
        // Zapisujemy wydatek w bazie
        await addDoc(expensesRef, {
            name: name,
            cost: cost,
            createdAt: new Date() // zapisujemy aktualny czas kliknięcia
        });

        // Czyścimy formularz
        expenseForm.reset();
    } catch (error) {
        console.error("Wystąpił błąd przy zapisie: ", error);
        alert("Błąd połączenia z bazą! Sprawdź konsolę.");
    }
});