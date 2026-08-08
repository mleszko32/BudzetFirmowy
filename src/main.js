import './style.css';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from "firebase/firestore";

// 1. WKLEJ TUTAJ SWÓJ CONFIG Z FIREBASE!
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

// Zmienne przechowujące to, w jakim zleceniu obecnie jesteśmy
let currentProjectId = null;
let currentProjectDeposit = 0;
let expensesUnsubscribe = null; // Do wyłączania nasłuchiwania przy powrocie do listy

// --- ELEMENTY HTML ---
const dashboardView = document.getElementById('dashboard-view');
const projectDetailsView = document.getElementById('project-details-view');

const newProjectForm = document.getElementById('new-project-form');
const projectsListContainer = document.getElementById('projects-list-container');
const btnBackToDashboard = document.getElementById('btn-back-to-dashboard');

// Pola szczegółów zlecenia
const detailsClientName = document.getElementById('details-client-name');
const totalPriceEl = document.getElementById('total-price');
const depositEl = document.getElementById('deposit');
const totalExpensesEl = document.getElementById('total-expenses');
const currentBalanceEl = document.getElementById('current-balance');

// Formularz i lista wydatków
const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseCostInput = document.getElementById('expense-cost');
const expenseListContainer = document.getElementById('expense-list-container');


// ==========================================
// 1. OBSŁUGA DASHBOARDU (PANELU GŁÓWNEGO)
// ==========================================

const projectsRef = collection(db, "projects");
const projectsQuery = query(projectsRef, orderBy("createdAt", "desc"));

// Pobieranie wszystkich zleceń i rysowanie kafelków
onSnapshot(projectsQuery, (snapshot) => {
    projectsListContainer.innerHTML = ''; 

    if (snapshot.empty) {
        projectsListContainer.innerHTML = '<p style="color: #718096;">Brak aktywnych zleceń. Utwórz pierwsze powyżej!</p>';
        return;
    }

    snapshot.forEach((firestoreDoc) => {
        const project = firestoreDoc.data();
        const projectId = firestoreDoc.id;

        const card = document.createElement('div');
        card.classList.add('card', 'project-card');
        
        card.innerHTML = `
            <h3>${project.name}</h3>
            <p>Wartość zlecenia: ${project.total.toFixed(2)} zł</p>
            <div class="project-meta">
                <span>Zaliczka: <span class="text-blue">${project.deposit.toFixed(2)} zł</span></span>
            </div>
        `;

        // Kliknięcie w kafelek otwiera dany projekt
        card.addEventListener('click', () => openProjectDetails(projectId, project));
        projectsListContainer.appendChild(card);
    });
});

// Zapisywanie nowego zlecenia z formularza
newProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('project-name').value;
    const total = parseFloat(document.getElementById('project-total').value);
    const deposit = parseFloat(document.getElementById('project-deposit').value);

    if (!name || isNaN(total) || isNaN(deposit)) return;

    try {
        await addDoc(collection(db, "projects"), {
            name: name,
            total: total,
            deposit: deposit,
            createdAt: new Date()
        });
        newProjectForm.reset();
    } catch (error) {
        console.error("Błąd zapisu:", error);
        alert("Nie udało się utworzyć zlecenia.");
    }
});


// ==========================================
// 2. PRZEŁĄCZANIE EKRANÓW 
// ==========================================

function openProjectDetails(projectId, projectData) {
    currentProjectId = projectId;
    currentProjectDeposit = projectData.deposit;

    // Uzupełniamy teksty na górze
    detailsClientName.textContent = projectData.name;
    totalPriceEl.textContent = `${projectData.total.toFixed(2)} zł`;
    depositEl.textContent = `${projectData.deposit.toFixed(2)} zł`;

    // Przełączamy widoki
    dashboardView.classList.add('hidden');
    projectDetailsView.classList.remove('hidden');

    // Pobieramy wydatki z konkretnego zlecenia
    loadExpensesForProject(projectId);
}

// Powrót do głównego menu
btnBackToDashboard.addEventListener('click', () => {
    dashboardView.classList.remove('hidden');
    projectDetailsView.classList.add('hidden');
    
    // Zatrzymujemy łącze dla starego projektu, żeby nie obciążać przeglądarki
    if (expensesUnsubscribe) {
        expensesUnsubscribe();
    }
    currentProjectId = null;
});


// ==========================================
// 3. OBSŁUGA WYDATKÓW (DLA WYBRANEGO ZLECENIA)
// ==========================================

function loadExpensesForProject(projectId) {
    const expensesRef = collection(db, "projects", projectId, "expenses");
    const expensesQuery = query(expensesRef, orderBy("createdAt", "desc"));

    // Zapisujemy łącze do zmiennej, żeby móc je potem przerwać
    expensesUnsubscribe = onSnapshot(expensesQuery, (snapshot) => {
        expenseListContainer.innerHTML = ''; 
        let totalSum = 0;

        snapshot.forEach((firestoreDoc) => {
            const data = firestoreDoc.data();
            totalSum += data.cost;
            const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();

            const li = document.createElement('li');
            li.classList.add('expense-item');
            li.innerHTML = `
                <div class="expense-info">
                    <strong>${data.name}</strong>
                    <span class="expense-date">${dateObj.toLocaleDateString('pl-PL')}</span>
                </div>
                <div class="expense-actions">
                    <span class="expense-amount text-red">- ${data.cost.toFixed(2)} zł</span>
                    <button class="btn-delete" data-id="${firestoreDoc.id}" title="Usuń wydatek">🗑️</button>
                </div>
            `;
            expenseListContainer.appendChild(li);
        });

        totalExpensesEl.textContent = `${totalSum.toFixed(2)} zł`;
        const balance = currentProjectDeposit - totalSum;
        currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;
    });
}

// Dodawanie wpisu
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    if (!currentProjectId) return; // Zabezpieczenie

    const name = expenseNameInput.value;
    const cost = parseFloat(expenseCostInput.value);
    
    if (!name || isNaN(cost)) return;

    try {
        await addDoc(collection(db, "projects", currentProjectId, "expenses"), {
            name: name,
            cost: cost,
            createdAt: new Date()
        });
        expenseForm.reset();
    } catch (error) {
        console.error("Błąd: ", error);
    }
});

// Usuwanie wpisu
expenseListContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete') && currentProjectId) {
        const expenseId = e.target.getAttribute('data-id');
        if(confirm("Czy usunąć wydatek?")) {
            await deleteDoc(doc(db, "projects", currentProjectId, "expenses", expenseId));
        }
    }
});