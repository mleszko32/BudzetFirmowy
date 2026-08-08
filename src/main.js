import './style.css';
// NOWOŚĆ: dodano import updateDoc
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";

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

let currentProjectId = null;
let currentProjectDeposit = 0;
let currentProjectStatus = 'active'; // Przechowuje status otwartego projektu
let expensesUnsubscribe = null; 

// --- ELEMENTY HTML ---
const dashboardView = document.getElementById('dashboard-view');
const projectDetailsView = document.getElementById('project-details-view');

const newProjectForm = document.getElementById('new-project-form');
const projectsListContainer = document.getElementById('projects-list-container');
const archivedProjectsListContainer = document.getElementById('archived-projects-list-container'); // NOWE
const btnBackToDashboard = document.getElementById('btn-back-to-dashboard');

const detailsClientName = document.getElementById('details-client-name');
const detailsStatusBadge = document.getElementById('details-status-badge'); // NOWE
const btnArchiveProject = document.getElementById('btn-archive-project'); // NOWE
const btnDeleteProject = document.getElementById('btn-delete-project'); // NOWE

const totalPriceEl = document.getElementById('total-price');
const depositEl = document.getElementById('deposit');
const totalExpensesEl = document.getElementById('total-expenses');
const currentBalanceEl = document.getElementById('current-balance');

const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseCostInput = document.getElementById('expense-cost');
const expenseListContainer = document.getElementById('expense-list-container');


// ==========================================
// 1. OBSŁUGA DASHBOARDU (PANELU GŁÓWNEGO)
// ==========================================

const projectsRef = collection(db, "projects");
const projectsQuery = query(projectsRef, orderBy("createdAt", "desc"));

// Tablica do trzymania "słuchaczy" wydatków, żeby nie obciążać przeglądarki
let dashboardExpenseListeners = [];

onSnapshot(projectsQuery, (snapshot) => {
    projectsListContainer.innerHTML = ''; 
    archivedProjectsListContainer.innerHTML = '';

    // Czyścimy stare nasłuchiwania przy każdym odświeżeniu listy
    dashboardExpenseListeners.forEach(unsub => unsub());
    dashboardExpenseListeners = [];

    let hasActive = false;
    let hasArchived = false;

    snapshot.forEach((firestoreDoc) => {
        const project = firestoreDoc.data();
        const projectId = firestoreDoc.id;
        const status = project.status || 'active'; 

        const card = document.createElement('div');
        card.classList.add('card', 'project-card');
        
        if(status === 'archived') {
            card.style.opacity = '0.7';
            card.style.backgroundColor = '#f8fafc';
        }
        
        // Przebudowany środek kafelka z miejscem na nowe podsumowanie finansowe
        card.innerHTML = `
            <h3>${project.name}</h3>
            <p style="margin-bottom: 12px; color: #4a5568;">Wartość zlecenia: <strong>${project.total.toFixed(2)} zł</strong></p>
            
            <div style="background: var(--bg-color); padding: 12px; border-radius: 8px; font-size: 14px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Pobrana zaliczka:</span>
                    <strong class="text-blue">${project.deposit.toFixed(2)} zł</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>Wydano na materiały:</span>
                    <strong class="text-red" id="card-exp-${projectId}">ładowanie...</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 15px;">
                    <span>Zostało gotówki:</span>
                    <strong id="card-bal-${projectId}">...</strong>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openProjectDetails(projectId, project));
        
        if(status === 'archived') {
            archivedProjectsListContainer.appendChild(card);
            hasArchived = true;
        } else {
            projectsListContainer.appendChild(card);
            hasActive = true;
        }

        // Pobieranie wydatków w tle dla tego konkretnego kafelka
        const expRef = collection(db, "projects", projectId, "expenses");
        const unsub = onSnapshot(expRef, (expSnap) => {
            let sum = 0;
            expSnap.forEach(e => sum += e.data().cost);
            
            const expEl = document.getElementById(`card-exp-${projectId}`);
            const balEl = document.getElementById(`card-bal-${projectId}`);
            
            if (expEl && balEl) {
                expEl.textContent = `${sum.toFixed(2)} zł`;
                
                const balance = project.deposit - sum;
                balEl.textContent = `${balance.toFixed(2)} zł`;
                
                // Automatyczne kolorowanie salda zaliczki (zielony/czerwony)
                if (balance >= 0) {
                    balEl.style.color = '#38a169'; 
                } else {
                    balEl.style.color = 'var(--red-color)'; 
                }
            }
        });
        
        dashboardExpenseListeners.push(unsub);
    });

    if (!hasActive) projectsListContainer.innerHTML = '<p style="color: #718096;">Brak aktywnych zleceń.</p>';
    if (!hasArchived) archivedProjectsListContainer.innerHTML = '<p style="color: #718096;">Brak projektów w archiwum.</p>';
});

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
            status: 'active', 
            createdAt: new Date()
        });

        if (deposit > 0) {
            await addDoc(collection(db, "company_finances"), {
                type: 'income',
                desc: `Zaliczka (Zlecenie: ${name})`,
                amount: deposit,
                createdAt: new Date()
            });
        }

        newProjectForm.reset();
    } catch (error) {
        console.error("Błąd zapisu:", error);
    }
});

// ==========================================
// 2. PRZEŁĄCZANIE EKRANÓW I AKCJE NA PROJEKCIE
// ==========================================

function openProjectDetails(projectId, projectData) {
    currentProjectId = projectId;
    currentProjectDeposit = projectData.deposit;
    currentProjectStatus = projectData.status || 'active';

    detailsClientName.textContent = projectData.name;
    totalPriceEl.textContent = `${projectData.total.toFixed(2)} zł`;
    depositEl.textContent = `${projectData.deposit.toFixed(2)} zł`;

    // Aktualizacja wyglądu nagłówka na podstawie statusu
    if (currentProjectStatus === 'archived') {
        detailsStatusBadge.textContent = 'Zakończone';
        detailsStatusBadge.style.backgroundColor = '#e2e8f0';
        detailsStatusBadge.style.color = '#4a5568';
        btnArchiveProject.textContent = 'Przywróć z archiwum';
    } else {
        detailsStatusBadge.textContent = 'W trakcie';
        detailsStatusBadge.style.backgroundColor = '#ebf8ff';
        detailsStatusBadge.style.color = '#3182ce';
        btnArchiveProject.textContent = 'Zarchiwizuj';
    }

    dashboardView.classList.add('hidden');
    projectDetailsView.classList.remove('hidden');

    loadExpensesForProject(projectId);
}

btnBackToDashboard.addEventListener('click', () => {
    dashboardView.classList.remove('hidden');
    projectDetailsView.classList.add('hidden');
    if (expensesUnsubscribe) {
        expensesUnsubscribe();
    }
    currentProjectId = null;
});

// ARCHIWIZACJA
btnArchiveProject.addEventListener('click', async () => {
    if(!currentProjectId) return;
    
    // Odwracamy status
    const newStatus = currentProjectStatus === 'archived' ? 'active' : 'archived';
    
    try {
        await updateDoc(doc(db, "projects", currentProjectId), {
            status: newStatus
        });
        // Po zmianie wracamy do listy
        btnBackToDashboard.click(); 
    } catch(error) {
        console.error("Błąd archiwizacji:", error);
    }
});

// USUWANIE
btnDeleteProject.addEventListener('click', async () => {
    if(!currentProjectId) return;
    
    if(confirm("Czy na pewno chcesz usunąć to zlecenie? Zniknie ono całkowicie z listy!")) {
        try {
            await deleteDoc(doc(db, "projects", currentProjectId));
            btnBackToDashboard.click(); 
        } catch(error) {
            console.error("Błąd usuwania:", error);
        }
    }
});


// ==========================================
// 3. OBSŁUGA WYDATKÓW (DLA WYBRANEGO ZLECENIA)
// ==========================================

function loadExpensesForProject(projectId) {
    const expensesRef = collection(db, "projects", projectId, "expenses");
    const expensesQuery = query(expensesRef, orderBy("createdAt", "desc"));

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

expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    if (!currentProjectId) return; 

    const name = expenseNameInput.value;
    const cost = parseFloat(expenseCostInput.value);
    
    if (!name || isNaN(cost)) return;

    try {
        await addDoc(collection(db, "projects", currentProjectId, "expenses"), {
            name: name,
            cost: cost,
            createdAt: new Date()
        });

        const projectName = detailsClientName.textContent; 
        await addDoc(collection(db, "company_finances"), {
            type: 'expense',
            desc: `Koszt zlecenia (${projectName}): ${name}`,
            amount: cost,
            createdAt: new Date()
        });

        expenseForm.reset();
    } catch (error) {
        console.error("Błąd: ", error);
    }
});

expenseListContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete') && currentProjectId) {
        const expenseId = e.target.getAttribute('data-id');
        if(confirm("Czy usunąć wydatek?")) {
            await deleteDoc(doc(db, "projects", currentProjectId, "expenses", expenseId));
        }
    }
});


// ==========================================
// 4. OBSŁUGA ZAKŁADEK (NAWIGACJA)
// ==========================================

const tabProjects = document.getElementById('tab-projects');
const tabFinances = document.getElementById('tab-finances');
const financesView = document.getElementById('finances-view');

tabFinances.addEventListener('click', () => {
    tabFinances.classList.add('active');
    tabProjects.classList.remove('active');
    
    dashboardView.classList.add('hidden');
    projectDetailsView.classList.add('hidden');
    financesView.classList.remove('hidden');
});

tabProjects.addEventListener('click', () => {
    tabProjects.classList.add('active');
    tabFinances.classList.remove('active');
    
    financesView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    projectDetailsView.classList.add('hidden');
    
    if (expensesUnsubscribe) {
        expensesUnsubscribe();
    }
    currentProjectId = null;
});


// ==========================================
// 5. OBSŁUGA FINANSÓW FIRMY
// ==========================================

const financeForm = document.getElementById('finance-form');
const financeListContainer = document.getElementById('finance-list-container');
const companyTotalBalanceEl = document.getElementById('company-total-balance');

const financesRef = collection(db, "company_finances");
const financesQuery = query(financesRef, orderBy("createdAt", "desc"));

onSnapshot(financesQuery, (snapshot) => {
    financeListContainer.innerHTML = '';
    let totalCompanyMoney = 0;

    if (snapshot.empty) {
        financeListContainer.innerHTML = '<p style="color: #718096;">Brak operacji finansowych.</p>';
        companyTotalBalanceEl.textContent = '0.00 zł';
        return;
    }

    snapshot.forEach((firestoreDoc) => {
        const data = firestoreDoc.data();
        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        
        if (data.type === 'income') {
            totalCompanyMoney += data.amount;
        } else {
            totalCompanyMoney -= data.amount;
        }

        let typeLabel = '';
        let amountColor = '';
        let sign = '';
        
        if (data.type === 'income') {
            typeLabel = 'Wpływ';
            amountColor = 'text-blue';
            sign = '+';
        } else if (data.type === 'expense') {
            // Pokazuje kategorię, jeśli została wybrana
            typeLabel = data.category && data.category !== "Brak" ? `Koszt: ${data.category}` : 'Koszt firmowy';
            amountColor = 'text-red';
            sign = '-';
        } else {
            typeLabel = 'Wypłata własna';
            amountColor = 'text-red';
            sign = '-';
        }

        const li = document.createElement('li');
        li.classList.add('expense-item');
        li.innerHTML = `
            <div class="expense-info">
                <strong>${data.desc}</strong>
                <span class="expense-date">${dateObj.toLocaleDateString('pl-PL')} | ${typeLabel}</span>
            </div>
            <div class="expense-actions">
                <span class="expense-amount ${amountColor}">${sign} ${data.amount.toFixed(2)} zł</span>
                <button class="btn-delete finance-delete" data-id="${firestoreDoc.id}" title="Usuń wpis">🗑️</button>
            </div>
        `;
        financeListContainer.appendChild(li);
    });

    companyTotalBalanceEl.textContent = `${totalCompanyMoney.toFixed(2)} zł`;
});

financeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = document.getElementById('finance-type').value;
    const category = document.getElementById('finance-category').value; // Pobieramy kategorię
    const desc = document.getElementById('finance-desc').value;
    const amount = parseFloat(document.getElementById('finance-amount').value);

    if (!desc || isNaN(amount)) return;

    try {
        await addDoc(collection(db, "company_finances"), {
            type: type,
            category: category || "Brak", // Zapisujemy do bazy
            desc: desc,
            amount: amount,
            createdAt: new Date()
        });
        financeForm.reset();
    } catch (error) {
        console.error("Błąd zapisu finansów:", error);
    }
});
financeListContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('finance-delete')) {
        const docId = e.target.getAttribute('data-id');
        if(confirm("Czy na pewno chcesz usunąć tę operację z kasy firmy?")) {
            await deleteDoc(doc(db, "company_finances", docId));
        }
    }
});