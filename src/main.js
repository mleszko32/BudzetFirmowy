import './style.css';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
// NOWOŚĆ: Importy autentykacji Firebase
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "firebase/auth";import Chart from 'chart.js/auto'; 

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
const auth = getAuth(app); // Inicjalizacja uwierzytelniania

// --- ELEMENTY LOGOWANIA ---
const authView = document.getElementById('auth-view');
const mainAppContainer = document.getElementById('main-app-container');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const authErrorEl = document.getElementById('auth-error');
const btnLogout = document.getElementById('btn-logout');

// Zmienne systemowe
let currentProjectId = null;
let currentProjectDeposit = 0;
let currentTotalExpenses = 0; 
let currentProjectStatus = 'active'; 
let expensesUnsubscribe = null; 
let projectUnsubscribe = null; 
let projectsUnsubscribe = null;
let financesUnsubscribe = null;

// --- ELEMENTY APLIKACJI ---
const dashboardView = document.getElementById('dashboard-view');
const projectDetailsView = document.getElementById('project-details-view');
const newProjectForm = document.getElementById('new-project-form');
const projectsListContainer = document.getElementById('projects-list-container');
const archivedProjectsListContainer = document.getElementById('archived-projects-list-container'); 
const btnBackToDashboard = document.getElementById('btn-back-to-dashboard');

const detailsClientName = document.getElementById('details-client-name');
const detailsStatusBadge = document.getElementById('details-status-badge'); 
const btnArchiveProject = document.getElementById('btn-archive-project'); 
const btnDeleteProject = document.getElementById('btn-delete-project'); 

const totalPriceEl = document.getElementById('total-price');
const depositEl = document.getElementById('deposit');
const totalExpensesEl = document.getElementById('total-expenses');
const currentBalanceEl = document.getElementById('current-balance');

const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseCostInput = document.getElementById('expense-cost');
const expenseListContainer = document.getElementById('expense-list-container');
const trancheForm = document.getElementById('tranche-form');
const trancheAmountInput = document.getElementById('tranche-amount');
const bulkExpenseForm = document.getElementById('bulk-expense-form');
const bulkExpenseText = document.getElementById('bulk-expense-text');


// ==========================================
// 0. OBSŁUGA AUTORYZACJI (LOGOWANIE / WYLOGOWANIE)
// ==========================================

// Słuchacz stanu zalogowania (sprawdza czy użytkownik ma sesję)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Zalogowany - chowamy okno logowania, pokazujemy apkę
        authView.classList.add('hidden');
        mainAppContainer.classList.remove('hidden');
        
        // Uruchamiamy pobieranie danych
        initApp();
    } else {
        // Niezalogowany - pokazujemy logowanie, chowamy apkę
        authView.classList.remove('hidden');
        mainAppContainer.classList.add('hidden');
        
        // Zatrzymujemy nasłuchiwanie bazy
        if (projectsUnsubscribe) projectsUnsubscribe();
        if (financesUnsubscribe) financesUnsubscribe();
        if (expensesUnsubscribe) expensesUnsubscribe();
        if (projectUnsubscribe) projectUnsubscribe();
    }
});

// Obsługa formularza logowania
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorEl.style.display = 'none';

    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (error) {
        console.error("Błąd logowania:", error.code);
        authErrorEl.textContent = "Nieprawidłowy e-mail lub hasło.";
        authErrorEl.style.display = 'block';
    }
});

// Wylogowanie
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Błąd wylogowania:", error);
    }
});


// Główna funkcja ładująca dane po zalogowaniu
function initApp() {
    // ==========================================
    // 1. OBSŁUGA DASHBOARDU (PANELU GŁÓWNEGO)
    // ==========================================
    const projectsRef = collection(db, "projects");
    const projectsQuery = query(projectsRef, orderBy("createdAt", "desc"));
    let dashboardExpenseListeners = [];

    projectsUnsubscribe = onSnapshot(projectsQuery, (snapshot) => {
        projectsListContainer.innerHTML = ''; 
        archivedProjectsListContainer.innerHTML = '';

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
            
            card.innerHTML = `
                <h3>${project.name}</h3>
                <p style="margin-bottom: 12px; color: #4a5568;">Wartość zlecenia: <strong>${project.total.toFixed(2)} zł</strong></p>
                
                <div style="background: var(--bg-color); padding: 12px; border-radius: 8px; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>Suma wpłat:</span>
                        <strong class="text-blue">${project.deposit.toFixed(2)} zł</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>Wydano na materiały:</span>
                        <strong class="text-red" id="card-exp-${projectId}">ładowanie...</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 15px;">
                        <span>Zostało z wpłat:</span>
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

} // <-- This closing brace was missing for the initApp function
    // ==========================================
// 5. OBSŁUGA FINANSÓW FIRMY
// ==========================================

const financeForm = document.getElementById('finance-form');
const financeListContainer = document.getElementById('finance-list-container');
const companyTotalBalanceEl = document.getElementById('company-total-balance');
const monthlySalaryTotalEl = document.getElementById('monthly-salary-total'); // Nowy licznik pensji
const financesRef = collection(db, "company_finances");
const financesQuery = query(financesRef, orderBy("createdAt", "desc"));

let expensesChartInstance = null; 
let lastFinancesSnapshot = null; // Trzymamy pobrane dane w pamięci
let currentFinanceFilter = 'all'; // Domyślny filtr

// Pobieranie danych z bazy w czasie rzeczywistym
onSnapshot(financesQuery, (snapshot) => {
    lastFinancesSnapshot = snapshot;
    renderFinancesList(); // Funkcja rysująca listę na podstawie wybranego filtra
});

// Funkcja odpowiedzialna za rysowanie historii i wykresów
function renderFinancesList() {
    if (!lastFinancesSnapshot) return;
    
    financeListContainer.innerHTML = '';
    let totalCompanyMoney = 0;
    let monthlySalarySum = 0;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const categoryTotals = {};
    let hasVisibleItems = false;

    if (lastFinancesSnapshot.empty) {
        financeListContainer.innerHTML = '<p style="color: #718096;">Brak operacji finansowych.</p>';
        companyTotalBalanceEl.textContent = '0.00 zł';
        monthlySalaryTotalEl.textContent = '0.00 zł';
        document.getElementById('monthly-summary-list').innerHTML = '<p>Brak wydatków w tym miesiącu.</p>';
        if(expensesChartInstance) expensesChartInstance.destroy();
        return;
    }

    lastFinancesSnapshot.forEach((firestoreDoc) => {
        const data = firestoreDoc.data();
        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        
        // Zliczanie globalne kasy
        if (data.type === 'income') {
            totalCompanyMoney += data.amount;
        } else {
            totalCompanyMoney -= data.amount;
        }

        // Zliczanie wypłat (pensji) w obecnym miesiącu
        if (data.type === 'withdrawal' && dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear) {
            monthlySalarySum += data.amount;
        }

        // Zliczanie kategorii do wykresu w obecnym miesiącu
        if (data.type === 'expense' && dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear) {
            const cat = data.category && data.category !== "Brak" ? data.category : "Inne / Nieprzypisane";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + data.amount;
        }

        // ZASTOSOWANIE FILTRA
        const isWithdrawal = data.type === 'withdrawal';
        if (currentFinanceFilter === 'operations' && isWithdrawal) return; // Skips withdrawals
        if (currentFinanceFilter === 'salary' && !isWithdrawal) return; // Skips non-withdrawals
        
        hasVisibleItems = true;

        let typeLabel = '';
        let amountColor = '';
        let sign = '';
        
        if (data.type === 'income') {
            typeLabel = 'Wpływ';
            amountColor = 'text-blue';
            sign = '+';
        } else if (data.type === 'expense') {
            typeLabel = data.category && data.category !== "Brak" ? `Koszt: ${data.category}` : 'Koszt firmowy';
            amountColor = 'text-red';
            sign = '-';
        } else {
            typeLabel = 'Wypłata własna';
            amountColor = 'text-purple'; // Wyróżnienie kolorem fioletowym
            sign = '-';
        }

        const li = document.createElement('li');
        li.classList.add('expense-item');
        // Jeśli to wypłata, możemy lekko zmienić styl, żeby się odróżniała
        if (data.type === 'withdrawal') {
            li.style.borderLeft = '4px solid #805ad5';
        }
        
        li.innerHTML = `
            <div class="expense-info">
                <strong>${data.desc}</strong>
                <span class="expense-date">${dateObj.toLocaleDateString('pl-PL')} | ${typeLabel}</span>
            </div>
            <div class="expense-actions">
                <span class="expense-amount ${amountColor}" style="${data.type === 'withdrawal' ? 'color: #805ad5;' : ''}">${sign} ${data.amount.toFixed(2)} zł</span>
                <button class="btn-delete finance-delete" data-id="${firestoreDoc.id}" title="Usuń wpis">🗑️</button>
            </div>
        `;
        financeListContainer.appendChild(li);
    });

    if (!hasVisibleItems) {
        financeListContainer.innerHTML = '<p style="color: #718096;">Brak operacji dla wybranego filtru.</p>';
    }

    // Aktualizacja kafelków tekstowych
    companyTotalBalanceEl.textContent = `${totalCompanyMoney.toFixed(2)} zł`;
    monthlySalaryTotalEl.textContent = `${monthlySalarySum.toFixed(2)} zł`;

    // Aktualizacja wykresu
    const labels = Object.keys(categoryTotals);
    const dataValues = Object.values(categoryTotals);
    const summaryListContainer = document.getElementById('monthly-summary-list');
    const ctx = document.getElementById('monthly-expenses-chart');

    if (expensesChartInstance) expensesChartInstance.destroy();

    if (labels.length > 0) {
        summaryListContainer.innerHTML = labels.map((label, index) => `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                <span>${label}</span>
                <strong>${dataValues[index].toFixed(2)} zł</strong>
            </div>
        `).join('');

        expensesChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: ['#e53e3e', '#3182ce', '#dd6b20', '#38a169', '#805ad5', '#718096'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    } else {
        summaryListContainer.innerHTML = '<p>Brak firmowych kosztów w tym miesiącu.</p>';
    }
}

// Obsługa przycisków filtrowania
const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Zdejmij klasę 'active' i domyślne kolory ze wszystkich przycisków
        filterButtons.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'var(--bg-color)';
            b.style.color = 'inherit';
        });
        
        // Nałóż styl aktywnego na kliknięty
        const clickedBtn = e.currentTarget;
        clickedBtn.classList.add('active');
        clickedBtn.style.background = 'var(--primary-color)';
        clickedBtn.style.color = 'white';
        
        // Zaktualizuj zmienną i przerysuj listę
        currentFinanceFilter = clickedBtn.getAttribute('data-filter');
        renderFinancesList();
    });
});

financeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = document.getElementById('finance-type').value;
    const category = document.getElementById('finance-category').value;
    const desc = document.getElementById('finance-desc').value;
    const amount = parseFloat(document.getElementById('finance-amount').value);

    if (!desc || isNaN(amount)) return;

    try {
        await addDoc(collection(db, "company_finances"), {
            type: type,
            category: category || "Brak",
            desc: desc,
            amount: amount,
            createdAt: new Date()
        });
        financeForm.reset();
    } catch (error) { console.error(error); }
});

financeListContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('finance-delete')) {
        const docId = e.target.getAttribute('data-id');
        if(confirm("Czy na pewno chcesz usunąć tę operację z kasy firmy?")) {
            await deleteDoc(doc(db, "company_finances", docId));
        }
    }
});
// ==========================================
// 6. OBSŁUGA ZMIANY HASŁA
// ==========================================
const changePasswordForm = document.getElementById('change-password-form');
const newPasswordInput = document.getElementById('new-password');
const confirmNewPasswordInput = document.getElementById('confirm-new-password');
const passwordChangeMessage = document.getElementById('password-change-message');

changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmNewPasswordInput.value;

    // Resetowanie komunikatów z poprzednich prób
    passwordChangeMessage.style.display = 'none';
    passwordChangeMessage.textContent = '';
    
    // Walidacja: czy hasła są takie same?
    if (newPassword !== confirmPassword) {
        passwordChangeMessage.textContent = "Podane hasła nie są identyczne!";
        passwordChangeMessage.style.color = '#e53e3e'; // Czerwony kolor błędu
        passwordChangeMessage.style.display = 'block';
        return;
    }

    // Walidacja: Firebase wymaga hasła o długości min. 6 znaków
    if (newPassword.length < 6) {
        passwordChangeMessage.textContent = "Hasło musi mieć co najmniej 6 znaków.";
        passwordChangeMessage.style.color = '#e53e3e';
        passwordChangeMessage.style.display = 'block';
        return;
    }

    const user = auth.currentUser;

    if (user) {
        try {
            // Wysłanie żądania zmiany hasła do Firebase
            await updatePassword(user, newPassword);
            
            passwordChangeMessage.textContent = "Hasło zostało pomyślnie zmienione!";
            passwordChangeMessage.style.color = '#38a169'; // Zielony kolor sukcesu
            passwordChangeMessage.style.display = 'block';
            changePasswordForm.reset();
            
        } catch (error) {
            console.error("Błąd zmiany hasła:", error);
            
            // Firebase dla bezpieczeństwa może wymagać tzw. "świeżego logowania" przy zmianie hasła
            if (error.code === 'auth/requires-recent-login') {
                passwordChangeMessage.textContent = "Dla bezpieczeństwa wyloguj się, zaloguj ponownie i spróbuj zmienić hasło raz jeszcze.";
            } else {
                passwordChangeMessage.textContent = "Wystąpił błąd. Spróbuj ponownie.";
            }
            
            passwordChangeMessage.style.color = '#e53e3e';
            passwordChangeMessage.style.display = 'block';
        }
    }
});