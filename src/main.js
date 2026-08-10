import './style.css';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "firebase/auth";
import Chart from 'chart.js/auto'; 

// 1. FIREBASE CONFIG
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
const auth = getAuth(app);

// --- ELEMENTY AUTH ---
const authView = document.getElementById('auth-view');
const mainAppContainer = document.getElementById('main-app-container');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const authErrorEl = document.getElementById('auth-error');
const btnLogout = document.getElementById('btn-logout');

// --- ZMIENNE SYSTEMOWE ---
let currentProjectId = null;
let currentProjectDeposit = 0;
let currentProjectTotal = 0; // TĘ ZMIENNĄ MUSIMY DODAĆ!
let currentTotalExpenses = 0; 
let currentProjectStatus = 'active'; 
let expensesUnsubscribe = null; 
let projectUnsubscribe = null; 
let projectsUnsubscribe = null;
let financesUnsubscribe = null;

// --- ELEMENTY APLIKACJI ---
const dashboardView = document.getElementById('dashboard-view');
const projectDetailsView = document.getElementById('project-details-view');
const financesView = document.getElementById('finances-view');

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

// Zakładki
const tabProjects = document.getElementById('tab-projects');
const tabFinances = document.getElementById('tab-finances');

// Finanse
const financeForm = document.getElementById('finance-form');
const financeListContainer = document.getElementById('finance-list-container');
const companyTotalBalanceEl = document.getElementById('company-total-balance');
const monthlySalaryTotalEl = document.getElementById('monthly-salary-total'); 
const monthSelect = document.getElementById('finance-month'); 
const yearSelect = document.getElementById('finance-year'); 

let expensesChartInstance = null; 
let lastFinancesSnapshot = null; 
let currentFinanceFilter = 'all'; 

// ==========================================
// 0. AUTORYZACJA (LOGOWANIE / WYLOGOWANIE)
// ==========================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (authView) authView.classList.add('hidden');
        if (mainAppContainer) mainAppContainer.classList.remove('hidden');
        initApp();
    } else {
        if (authView) authView.classList.remove('hidden');
        if (mainAppContainer) mainAppContainer.classList.add('hidden');
        
        if (projectsUnsubscribe) projectsUnsubscribe();
        if (financesUnsubscribe) financesUnsubscribe();
        if (expensesUnsubscribe) expensesUnsubscribe();
        if (projectUnsubscribe) projectUnsubscribe();
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (authErrorEl) authErrorEl.style.display = 'none';

        const email = loginEmailInput ? loginEmailInput.value : '';
        const password = loginPasswordInput ? loginPasswordInput.value : '';

        try {
            await signInWithEmailAndPassword(auth, email, password);
            loginForm.reset();
        } catch (error) {
            console.error("Błąd logowania:", error.code);
            if (authErrorEl) {
                authErrorEl.textContent = "Nieprawidłowy e-mail lub hasło.";
                authErrorEl.style.display = 'block';
            }
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Błąd wylogowania:", error);
        }
    });
}

// ==========================================
// GŁÓWNA INICJALIZACJA DANYCH
// ==========================================
function initApp() {
    
    // --- NAVIGACJA ZAKŁADEK ---
    if (tabFinances) {
        tabFinances.addEventListener('click', () => {
            if (tabFinances) tabFinances.classList.add('active');
            if (tabProjects) tabProjects.classList.remove('active');
            
            if (dashboardView) dashboardView.classList.add('hidden');
            if (projectDetailsView) projectDetailsView.classList.add('hidden');
            if (financesView) financesView.classList.remove('hidden');
        });
    }

    if (tabProjects) {
        tabProjects.addEventListener('click', () => {
            if (tabProjects) tabProjects.classList.add('active');
            if (tabFinances) tabFinances.classList.remove('active');
            
            if (financesView) financesView.classList.add('hidden');
            if (dashboardView) dashboardView.classList.remove('hidden');
            if (projectDetailsView) projectDetailsView.classList.add('hidden');
            
            if (expensesUnsubscribe) expensesUnsubscribe();
            if (projectUnsubscribe) projectUnsubscribe();
            currentProjectId = null;
        });
    }

    // --- DASHBOARD (PROJEKTY) ---
    const projectsRef = collection(db, "projects");
    const projectsQuery = query(projectsRef, orderBy("createdAt", "desc"));
    let dashboardExpenseListeners = [];

    projectsUnsubscribe = onSnapshot(projectsQuery, (snapshot) => {
        if (!projectsListContainer) return;
        projectsListContainer.innerHTML = ''; 
        if (archivedProjectsListContainer) archivedProjectsListContainer.innerHTML = '';

        dashboardExpenseListeners.forEach(unsub => unsub());
        dashboardExpenseListeners = [];

        let hasActive = false;
        let hasArchived = false;
        let totalReceivables = 0; // NOWOŚĆ: Zmienna zbierająca pieniądze do odbioru z całego kraju :)

        snapshot.forEach((firestoreDoc) => {
            const project = firestoreDoc.data();
            const projectId = firestoreDoc.id;
            const status = project.status || 'active'; 

            // NOWOŚĆ: Obliczamy ile zostało do zapłaty dla aktywnych zleceń
            if (status !== 'archived') {
                const remaining = project.total - (project.deposit || 0);
                if (remaining > 0) {
                    totalReceivables += remaining;
                }
            }

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
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Wpłacono:</span>
                        <strong class="text-blue">${project.deposit.toFixed(2)} zł</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Do odbioru:</span>
                        <strong style="color: #ed8936;">${(project.total - project.deposit).toFixed(2)} zł</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Wydano na materiały:</span>
                        <strong class="text-red" id="card-exp-${projectId}">ładowanie...</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 15px;">
                        <span>Szacowany zysk:</span>
                        <strong id="card-profit-${projectId}">...</strong>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => openProjectDetails(projectId, project));
            
            if(status === 'archived' && archivedProjectsListContainer) {
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
                const profitEl = document.getElementById(`card-profit-${projectId}`); 
                
                if (expEl && profitEl) {
                    expEl.textContent = `${sum.toFixed(2)} zł`;
                    const profit = project.total - sum;
                    profitEl.textContent = `${profit.toFixed(2)} zł`;
                    profitEl.style.color = profit >= 0 ? '#38a169' : 'var(--red-color)'; 
                }
            });
            
            dashboardExpenseListeners.push(unsub);
        });

        if (!hasActive && projectsListContainer) projectsListContainer.innerHTML = '<p style="color: #718096;">Brak aktywnych zleceń.</p>';
        if (!hasArchived && archivedProjectsListContainer) archivedProjectsListContainer.innerHTML = '<p style="color: #718096;">Brak projektów w archiwum.</p>';
        
        // NOWOŚĆ: Aktualizacja kafelka z globalną kwotą do odbioru w zakładce Finanse
        const receivablesEl = document.getElementById('company-receivables');
        if (receivablesEl) {
            receivablesEl.textContent = `${totalReceivables.toFixed(2)} zł`;
        }
    });

    // --- FINANSE FIRMY ---
    const financesRef = collection(db, "company_finances");
    const financesQuery = query(financesRef, orderBy("createdAt", "desc"));

    const now = new Date();
    if (monthSelect) monthSelect.value = now.getMonth(); 
    if (yearSelect) yearSelect.value = now.getFullYear();

    if (monthSelect) monthSelect.addEventListener('change', renderFinancesList);
    if (yearSelect) yearSelect.addEventListener('change', renderFinancesList);

    financesUnsubscribe = onSnapshot(financesQuery, (snapshot) => {
        lastFinancesSnapshot = snapshot;
        renderFinancesList(); 
    });
}
// --- OTWIERANIE PROJEKTU ---
function openProjectDetails(projectId, projectData) {
    currentProjectId = projectId;
    currentProjectStatus = projectData.status || 'active';
    currentProjectTotal = projectData.total; // Zapisujemy wartość zlecenia

    if (detailsClientName) detailsClientName.textContent = projectData.name;
    if (totalPriceEl) totalPriceEl.textContent = `${projectData.total.toFixed(2)} zł`;

    if (detailsStatusBadge && btnArchiveProject) {
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
    }

    if (dashboardView) dashboardView.classList.add('hidden');
    if (projectDetailsView) projectDetailsView.classList.remove('hidden');

    if (projectUnsubscribe) projectUnsubscribe();
    projectUnsubscribe = onSnapshot(doc(db, "projects", projectId), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            currentProjectDeposit = data.deposit;
            currentProjectTotal = data.total; // NOWOŚĆ: Aktualizacja wartości w locie
            
            if (totalPriceEl) totalPriceEl.textContent = `${currentProjectTotal.toFixed(2)} zł`;
            if (depositEl) depositEl.textContent = `${currentProjectDeposit.toFixed(2)} zł`;
            
            const balance = currentProjectDeposit - currentTotalExpenses;
            if (currentBalanceEl) currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;

            const remainingToPayEl = document.getElementById('remaining-to-pay');
            if (remainingToPayEl) {
                remainingToPayEl.textContent = `${(currentProjectTotal - currentProjectDeposit).toFixed(2)} zł`;
            }

            // NOWOŚĆ: Przeliczamy od razu szacowany zysk po zmianie całkowitej kwoty
            const expectedProfitEl = document.getElementById('expected-profit');
            if (expectedProfitEl) {
                const expectedProfit = currentProjectTotal - currentTotalExpenses;
                expectedProfitEl.textContent = `${expectedProfit.toFixed(2)} zł`;
                expectedProfitEl.style.color = expectedProfit >= 0 ? '#38a169' : 'var(--red-color)';
            }
        }
    });

    loadExpensesForProject(projectId);
}

if (btnBackToDashboard) {
    btnBackToDashboard.addEventListener('click', () => {
        if (dashboardView) dashboardView.classList.remove('hidden');
        if (projectDetailsView) projectDetailsView.classList.add('hidden');
        if (expensesUnsubscribe) expensesUnsubscribe();
        if (projectUnsubscribe) projectUnsubscribe();
        currentProjectId = null;
    });
}

if (btnArchiveProject) {
    btnArchiveProject.addEventListener('click', async () => {
        if(!currentProjectId) return;
        const newStatus = currentProjectStatus === 'archived' ? 'active' : 'archived';
        try {
            await updateDoc(doc(db, "projects", currentProjectId), { status: newStatus });
            if (btnBackToDashboard) btnBackToDashboard.click(); 
        } catch(error) { console.error(error); }
    });
}

if (btnDeleteProject) {
    btnDeleteProject.addEventListener('click', async () => {
        if(!currentProjectId) return;
        if(confirm("Czy na pewno chcesz usunąć to zlecenie? Zniknie ono całkowicie z listy!")) {
            try {
                await deleteDoc(doc(db, "projects", currentProjectId));
                if (btnBackToDashboard) btnBackToDashboard.click(); 
            } catch(error) { console.error(error); }
        }
    });
}

function loadExpensesForProject(projectId) {
    const expensesRef = collection(db, "projects", projectId, "expenses");
    const expensesQuery = query(expensesRef, orderBy("createdAt", "desc"));

    expensesUnsubscribe = onSnapshot(expensesQuery, (snapshot) => {
        if (!expenseListContainer) return;
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

        currentTotalExpenses = totalSum; 
        if (totalExpensesEl) totalExpensesEl.textContent = `${totalSum.toFixed(2)} zł`;
        
        const balance = currentProjectDeposit - totalSum;
        if (currentBalanceEl) currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;

        // Aktualizacja kafelka "Szacowany zysk na czysto"
        const expectedProfitEl = document.getElementById('expected-profit');
        if (expectedProfitEl) {
            const expectedProfit = currentProjectTotal - totalSum;
            expectedProfitEl.textContent = `${expectedProfit.toFixed(2)} zł`;
            expectedProfitEl.style.color = expectedProfit >= 0 ? '#38a169' : 'var(--red-color)';
        }
    });
}

if (newProjectForm) {
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
                    desc: `Zaliczka na start (Zlecenie: ${name})`,
                    amount: deposit,
                    createdAt: new Date()
                });
            }
            newProjectForm.reset();
        } catch (error) { console.error(error); }
    });
}

if (expenseForm) {
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

            const projectName = detailsClientName ? detailsClientName.textContent : ''; 
            await addDoc(collection(db, "company_finances"), {
                type: 'expense',
                desc: `Koszt zlecenia (${projectName}): ${name}`,
                amount: cost,
                createdAt: new Date()
            });

            expenseForm.reset();
        } catch (error) { console.error(error); }
    });
}

if (expenseListContainer) {
    expenseListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-delete') && currentProjectId) {
            const expenseId = e.target.getAttribute('data-id');
            if(confirm("Czy usunąć wydatek?")) {
                await deleteDoc(doc(db, "projects", currentProjectId, "expenses", expenseId));
            }
        }
    });
}

if (trancheForm) {
    trancheForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentProjectId) return;

        const amount = parseFloat(trancheAmountInput.value);
        if (isNaN(amount) || amount <= 0) return;

        try {
            const newDeposit = currentProjectDeposit + amount;
            await updateDoc(doc(db, "projects", currentProjectId), { deposit: newDeposit });

            const projectName = detailsClientName ? detailsClientName.textContent : '';
            await addDoc(collection(db, "company_finances"), {
                type: 'income',
                desc: `Kolejna transza (Zlecenie: ${projectName})`,
                amount: amount,
                createdAt: new Date()
            });

            trancheForm.reset();
        } catch (error) { console.error(error); }
    });
}

// --- RENDERING FINANSÓW FIRMY ---
// --- RENDERING FINANSÓW FIRMY ---
function renderFinancesList() {
    if (!lastFinancesSnapshot || !financeListContainer) return;
    
    financeListContainer.innerHTML = '';
    let totalCompanyMoney = 0;
    let monthlySalarySum = 0;
    
    const targetMonth = monthSelect ? parseInt(monthSelect.value, 10) : new Date().getMonth();
    const targetYear = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
    
    const categoryTotals = {};
    let hasVisibleItems = false;
    
    // NOWOŚĆ: Obiekt przechowujący pogrupowane operacje
    const groupedByDate = {}; 

    if (lastFinancesSnapshot.empty) {
        financeListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak operacji finansowych.</p>';
        if (companyTotalBalanceEl) companyTotalBalanceEl.textContent = '0.00 zł';
        if (monthlySalaryTotalEl) monthlySalaryTotalEl.textContent = '0.00 zł';
        const summaryListContainer = document.getElementById('monthly-summary-list');
        if (summaryListContainer) summaryListContainer.innerHTML = '<p>Brak wydatków.</p>';
        if (expensesChartInstance) expensesChartInstance.destroy();
        return;
    }

    lastFinancesSnapshot.forEach((firestoreDoc) => {
        const data = firestoreDoc.data();
        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        
        if (data.type === 'income') {
            totalCompanyMoney += data.amount;
        } else {
            totalCompanyMoney -= data.amount;
        }

        if (data.type === 'withdrawal' && dateObj.getMonth() === targetMonth && dateObj.getFullYear() === targetYear) {
            monthlySalarySum += data.amount;
        }

        if (data.type === 'expense' && dateObj.getMonth() === targetMonth && dateObj.getFullYear() === targetYear) {
            const cat = data.category && data.category !== "Brak" ? data.category : "Inne / Nieprzypisane";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + data.amount;
        }

        const isWithdrawal = data.type === 'withdrawal';
        if (currentFinanceFilter === 'operations' && isWithdrawal) return; 
        if (currentFinanceFilter === 'salary' && !isWithdrawal) return; 
        
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
            amountColor = 'text-purple'; 
            sign = '-';
        }

        // Przygotowujemy klucz daty (np. 10.08.2026)
        const dateStr = dateObj.toLocaleDateString('pl-PL');
        if (!groupedByDate[dateStr]) {
            groupedByDate[dateStr] = [];
        }
        
        // Zapisujemy element w odpowiedniej szufladce dnia
        groupedByDate[dateStr].push({ id: firestoreDoc.id, ...data, typeLabel, amountColor, sign });
    });

    // RYSOWANIE POGRUPOWANYCH DANYCH
    if (!hasVisibleItems) {
        financeListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak operacji dla wybranego filtru.</p>';
    } else {
        for (const [dateStr, items] of Object.entries(groupedByDate)) {
            // Dodajemy nagłówek z datą
            const dateHeader = document.createElement('div');
            dateHeader.innerHTML = `<h4 style="margin: 20px 0 8px 0; border-bottom: 2px solid var(--border-color); padding-bottom: 4px; color: #4a5568; font-size: 13px;">📅 ${dateStr}</h4>`;
            financeListContainer.appendChild(dateHeader);

            // Wrzucamy pod niego wszystkie operacje z tego dnia
            items.forEach(item => {
                const li = document.createElement('li');
                li.classList.add('expense-item');
                if (item.type === 'withdrawal') {
                    li.style.borderLeft = '4px solid #805ad5';
                }
                
                li.innerHTML = `
                    <div class="expense-info">
                        <strong>${item.desc}</strong>
                        <span class="expense-date">${item.typeLabel}</span>
                    </div>
                    <div class="expense-actions">
                        <span class="expense-amount ${item.amountColor}" style="${item.type === 'withdrawal' ? 'color: #805ad5;' : ''}">${item.sign} ${item.amount.toFixed(2)} zł</span>
                        <button class="btn-delete finance-delete" data-id="${item.id}" title="Usuń wpis">🗑️</button>
                    </div>
                `;
                financeListContainer.appendChild(li);
            });
        }
    }

    if (companyTotalBalanceEl) companyTotalBalanceEl.textContent = `${totalCompanyMoney.toFixed(2)} zł`;
    if (monthlySalaryTotalEl) monthlySalaryTotalEl.textContent = `${monthlySalarySum.toFixed(2)} zł`;

    const labels = Object.keys(categoryTotals);
    const dataValues = Object.values(categoryTotals);
    const summaryListContainer = document.getElementById('monthly-summary-list');
    const ctx = document.getElementById('monthly-expenses-chart');

    if (expensesChartInstance) expensesChartInstance.destroy();

    if (labels.length > 0 && summaryListContainer && ctx) {
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
    } else if (summaryListContainer) {
        summaryListContainer.innerHTML = '<p>Brak firmowych kosztów w tym miesiącu.</p>';
    }
}

const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        filterButtons.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'var(--bg-color)';
            b.style.color = 'inherit';
        });
        
        const clickedBtn = e.currentTarget;
        clickedBtn.classList.add('active');
        clickedBtn.style.background = 'var(--primary-color)';
        clickedBtn.style.color = 'white';
        
        currentFinanceFilter = clickedBtn.getAttribute('data-filter');
        renderFinancesList();
    });
});

if (financeForm) {
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
}

if (financeListContainer) {
    financeListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('finance-delete')) {
            const docId = e.target.getAttribute('data-id');
            if(confirm("Czy na pewno chcesz usunąć tę operację z kasy firmy?")) {
                await deleteDoc(doc(db, "company_finances", docId));
            }
        }
    });
}

// ZMIANA HASŁA (ZABEZPIECZONA)
const changePasswordForm = document.getElementById('change-password-form');
if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPasswordInput = document.getElementById('new-password');
        const confirmNewPasswordInput = document.getElementById('confirm-new-password');
        const passwordChangeMessage = document.getElementById('password-change-message');

        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmNewPasswordInput ? confirmNewPasswordInput.value : '';

        if (passwordChangeMessage) {
            passwordChangeMessage.style.display = 'none';
            passwordChangeMessage.textContent = '';
        }
        
        if (newPassword !== confirmPassword) {
            if (passwordChangeMessage) {
                passwordChangeMessage.textContent = "Podane hasła nie są identyczne!";
                passwordChangeMessage.style.color = '#e53e3e'; 
                passwordChangeMessage.style.display = 'block';
            }
            return;
        }

        if (newPassword.length < 6) {
            if (passwordChangeMessage) {
                passwordChangeMessage.textContent = "Hasło musi mieć co najmniej 6 znaków.";
                passwordChangeMessage.style.color = '#e53e3e';
                passwordChangeMessage.style.display = 'block';
            }
            return;
        }

        const user = auth.currentUser;
        if (user) {
            try {
                await updatePassword(user, newPassword);
                if (passwordChangeMessage) {
                    passwordChangeMessage.textContent = "Hasło zostało pomyślnie zmienione!";
                    passwordChangeMessage.style.color = '#38a169'; 
                    passwordChangeMessage.style.display = 'block';
                }
                changePasswordForm.reset();
            } catch (error) {
                console.error("Błąd zmiany hasła:", error);
                if (passwordChangeMessage) {
                    passwordChangeMessage.textContent = error.code === 'auth/requires-recent-login' 
                        ? "Dla bezpieczeństwa wyloguj się, zaloguj ponownie i spróbuj zmienić hasło raz jeszcze."
                        : "Wystąpił błąd. Spróbuj ponownie.";
                    passwordChangeMessage.style.color = '#e53e3e';
                    passwordChangeMessage.style.display = 'block';
                }
            }
        }
    });
}
// ==========================================
// EDYCJA WARTOŚCI ZLECENIA
// ==========================================
const btnEditTotal = document.getElementById('btn-edit-total');
if (btnEditTotal) {
    btnEditTotal.addEventListener('click', async () => {
        if (!currentProjectId) return;
        
        // Wyświetlamy okienko z prośbą o wpisanie nowej kwoty
        const newVal = prompt("Podaj nową całkowitą wartość zlecenia (zł):", currentProjectTotal);
        
        // Jeśli użytkownik anuluje, przerywamy
        if (newVal === null) return; 
        
        const parsedVal = parseFloat(newVal);
        if (isNaN(parsedVal) || parsedVal < 0) {
            alert("Podano nieprawidłową kwotę.");
            return;
        }

        try {
            // Wysyłamy nową wartość do Firebase
            await updateDoc(doc(db, "projects", currentProjectId), { 
                total: parsedVal 
            });
        } catch (error) { 
            console.error("Błąd podczas edycji kwoty: ", error); 
        }
    });
}
// ==========================================
// PLANOWANE WYDATKI (ZUS, PODATKI, RATY)
// ==========================================

const plannedExpenseForm = document.getElementById('planned-expense-form');
const plannedListContainer = document.getElementById('planned-list-container');
let plannedUnsubscribe = null;

// Pobieranie danych z bazy (tylko dla zalogowanego)
onAuthStateChanged(auth, (user) => {
    if (user) {
        const plannedRef = collection(db, "planned_expenses");
        const plannedQuery = query(plannedRef, orderBy("dueDate", "asc"));
        
        plannedUnsubscribe = onSnapshot(plannedQuery, (snapshot) => {
            if (!plannedListContainer) return;
            plannedListContainer.innerHTML = '';
            
            if (snapshot.empty) {
                plannedListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak oczekujących płatności. Uff!</p>';
                return;
            }

            snapshot.forEach((firestoreDoc) => {
                const data = firestoreDoc.data();
                const docId = firestoreDoc.id;

                // Weryfikacja czy termin już minął
                const today = new Date();
                today.setHours(0,0,0,0);
                const dueDate = new Date(data.dueDate);
                const isOverdue = dueDate < today;

                const li = document.createElement('li');
                li.classList.add('expense-item');
                li.style.borderLeft = isOverdue ? '4px solid #e53e3e' : '4px solid #ed8936';

                li.innerHTML = `
                    <div class="expense-info">
                        <strong>${data.name}</strong>
                        <span class="expense-date" style="${isOverdue ? 'color: #e53e3e; font-weight: bold;' : ''}">Termin: ${dueDate.toLocaleDateString('pl-PL')}</span>
                    </div>
                    <div class="expense-actions" style="display: flex; align-items: center; gap: 12px;">
                        <span class="expense-amount text-red">- ${data.amount.toFixed(2)} zł</span>
                        <button class="btn btn-primary btn-pay-planned" 
                                data-id="${docId}" 
                                data-name="${data.name}" 
                                data-amount="${data.amount}" 
                                style="background-color: #38a169; border-color: #38a169; padding: 4px 8px; font-size: 12px;">
                            Opłać
                        </button>
                        <button class="btn-delete btn-delete-planned" data-id="${docId}" title="Usuń z planowanych bez opłacania">🗑️</button>
                    </div>
                `;
                plannedListContainer.appendChild(li);
            });
        });
    } else {
        if (plannedUnsubscribe) plannedUnsubscribe();
    }
});

// Zapisywanie nowego planowanego wydatku
if (plannedExpenseForm) {
    plannedExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('planned-name').value;
        const amount = parseFloat(document.getElementById('planned-amount').value);
        const dateString = document.getElementById('planned-date').value;

        if (!name || isNaN(amount) || !dateString) return;

        try {
            await addDoc(collection(db, "planned_expenses"), {
                name: name,
                amount: amount,
                dueDate: dateString,
                createdAt: new Date()
            });
            plannedExpenseForm.reset();
        } catch (error) { console.error("Błąd zapisu planowanego wydatku:", error); }
    });
}

// Obsługa przycisków "Opłać" i kosza w sekcji planowanych
if (plannedListContainer) {
    plannedListContainer.addEventListener('click', async (e) => {
        
        // Funkcja 1: Kliknięto zielone "Opłać"
        if (e.target.classList.contains('btn-pay-planned')) {
            const docId = e.target.getAttribute('data-id');
            const name = e.target.getAttribute('data-name');
            const amount = parseFloat(e.target.getAttribute('data-amount'));

            try {
                // Dodajemy to do głównej kasy jako normalny koszt
                await addDoc(collection(db, "company_finances"), {
                    type: 'expense',
                    category: "Opłaty stałe", // Automatycznie kategoryzujemy jako opłatę stałą
                    desc: name,
                    amount: amount,
                    createdAt: new Date()
                });
                
                // I wyrzucamy z listy oczekujących
                await deleteDoc(doc(db, "planned_expenses", docId));
            } catch (error) { console.error(error); }
        }

        // Funkcja 2: Kliknięto ikonę kosza (anulowanie)
        if (e.target.classList.contains('btn-delete-planned')) {
            const docId = e.target.getAttribute('data-id');
            if(confirm("Czy na pewno chcesz usunąć tę pozycję z planowanych? Pieniądze NIE zostaną potrącone z kasy.")) {
                await deleteDoc(doc(db, "planned_expenses", docId));
            }
        }
    });
}