import './style.css';
// 1. Zaktualizowane importy - dodano deleteDoc i doc
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from "firebase/firestore";

// 2. Wklej tutaj swój skopiowany z Firebase config!
const firebaseConfig = {
  apiKey: "AIzaSyCSE0dGsBBWkzV1Ceuw9GeMJB520UvVHaY",
  authDomain: "budzetfirmowy-3dd46.firebaseapp.com",
  projectId: "budzetfirmowy-3dd46",
  storageBucket: "budzetfirmowy-3dd46.firebasestorage.app",
  messagingSenderId: "725951455675",
  appId: "1:725951455675:web:9d53f510f78f008af7e49e"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseCostInput = document.getElementById('expense-cost');
const expenseListContainer = document.getElementById('expense-list-container');
const totalExpensesEl = document.getElementById('total-expenses');
const currentBalanceEl = document.getElementById('current-balance');

let deposit = 4000; 

const expensesRef = collection(db, "projects", "kowalski", "expenses");
const expensesQuery = query(expensesRef, orderBy("createdAt", "desc"));

// 3. Generowanie listy (z dodanym przyciskiem usuwania)
onSnapshot(expensesQuery, (snapshot) => {
    expenseListContainer.innerHTML = ''; 
    let totalSum = 0;

    snapshot.forEach((firestoreDoc) => {
        const data = firestoreDoc.data();
        totalSum += data.cost;

        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        const dateStr = dateObj.toLocaleDateString('pl-PL');

        const newExpenseItem = document.createElement('li');
        newExpenseItem.classList.add('expense-item');
        
        // Zauważ nowy div.expense-actions i button.btn-delete z atrybutem data-id
        newExpenseItem.innerHTML = `
            <div class="expense-info">
                <strong>${data.name}</strong>
                <span class="expense-date">${dateStr}</span>
            </div>
            <div class="expense-actions">
                <span class="expense-amount text-red">- ${data.cost.toFixed(2)} zł</span>
                <button class="btn-delete" data-id="${firestoreDoc.id}" title="Usuń wydatek">🗑️</button>
            </div>
        `;

        expenseListContainer.appendChild(newExpenseItem);
    });

    totalExpensesEl.textContent = `${totalSum.toFixed(2)} zł`;
    const balance = deposit - totalSum;
    currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;
});

// 4. Dodawanie wpisu (bez zmian)
expenseForm.addEventListener('submit', async function(event) {
    event.preventDefault(); 

    const name = expenseNameInput.value;
    const cost = parseFloat(expenseCostInput.value);

    if (!name || isNaN(cost)) return;

    try {
        await addDoc(expensesRef, {
            name: name,
            cost: cost,
            createdAt: new Date()
        });
        expenseForm.reset();
    } catch (error) {
        console.error("Wystąpił błąd przy zapisie: ", error);
        alert("Błąd połączenia z bazą! Sprawdź konsolę.");
    }
});

// 5. NOWE: Usuwanie wydatku po kliknięciu
expenseListContainer.addEventListener('click', async (event) => {
    // Sprawdzamy, czy kliknięty element to przycisk usuwania
    if (event.target.classList.contains('btn-delete')) {
        // Pobieramy ID dokumentu ukryte w atrybucie data-id
        const docId = event.target.getAttribute('data-id');
        
        // Potwierdzenie usunięcia
        if(confirm("Czy na pewno chcesz usunąć ten wydatek?")) {
            try {
                // Tworzymy referencję do konkretnego dokumentu i go usuwamy
                const docToDelete = doc(db, "projects", "kowalski", "expenses", docId);
                await deleteDoc(docToDelete);
            } catch (error) {
                console.error("Błąd podczas usuwania:", error);
                alert("Nie udało się usunąć wpisu.");
            }
        }
    }
});