import './style.css';
import { initializeApp } from "firebase/app";
// Dodane nowe funkcje do obsługi Kosza: getDoc i setDoc
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
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

// --- ZMIENNE SYSTEMOWE I PAMIĘĆ ---
const authView = document.getElementById('auth-view');
const mainAppContainer = document.getElementById('main-app-container');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const authErrorEl = document.getElementById('auth-error');
const btnLogout = document.getElementById('btn-logout');

let currentCompanyTotal = 0;
let currentTotalPlanned = 0;
let currentProjectId = null;
let currentProjectDeposit = 0;
let currentProjectTotal = 0; 
let currentTotalExpenses = 0; 
let currentProjectStatus = 'active'; 

let expensesUnsubscribe = null; 
let projectUnsubscribe = null; 
let projectsUnsubscribe = null;
let financesUnsubscribe = null;
let trashUnsubscribe = null;
let activeProjectsList = []; 

// --- ELEMENTY WIZUALNE ---
const dashboardView = document.getElementById('dashboard-view');
const projectDetailsView = document.getElementById('project-details-view');
const financesView = document.getElementById('finances-view');
const scannerView = document.getElementById('scanner-view');
const trashView = document.getElementById('trash-view'); // NOWOŚĆ: Kosz

const tabProjects = document.getElementById('tab-projects');
const tabFinances = document.getElementById('tab-finances');
const tabScanner = document.getElementById('tab-scanner');
const tabTrash = document.getElementById('tab-trash'); // NOWOŚĆ: Kosz

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
// FUNKCJE AWARYJNE: KOSZ I PRZYWRACANIE
// ==========================================
// Funkcja przenosząca dowolny element do nowej kolekcji Kosza
async function moveToTrash(docRef, description, linkedFinanceId = null) {
    try {
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;

        const trashData = {
            originalPath: docRef.path,
            originalData: snap.data(),
            desc: description,
            deletedAt: new Date(),
            linkedFinancePath: null,
            linkedFinanceData: null
        };

        // Naprawa błędu synchronizacji: Jeśli usuwamy wydatek ze zlecenia, sprawdzamy czy ma on wpis w kasie!
        if (linkedFinanceId) {
            const finRef = doc(db, "company_finances", linkedFinanceId);
            const finSnap = await getDoc(finRef);
            if (finSnap.exists()) {
                trashData.linkedFinancePath = finRef.path;
                trashData.linkedFinanceData = finSnap.data();
                await deleteDoc(finRef); // Usunięcie pociąga za sobą wpis w kasie
            }
        }

        // Zapis do bezpiecznego kosza i usunięcie oryginału
        await addDoc(collection(db, "trash"), trashData);
        await deleteDoc(docRef);
    } catch(err) { console.error("Błąd przenoszenia do kosza:", err); }
}

// Funkcja przywracająca element z Kosza na właściwe miejsce
async function restoreFromTrash(trashDocId) {
    try {
        const trashRef = doc(db, "trash", trashDocId);
        const snap = await getDoc(trashRef);
        if (!snap.exists()) return;

        const data = snap.data();
        
        // Odtwarzamy oryginał na dokładnej ścieżce, z której zniknął
        await setDoc(doc(db, data.originalPath), data.originalData);

        // Odtwarzamy wpis w kasie, jeśli taki był powiązany z wydatkiem
        if (data.linkedFinancePath && data.linkedFinanceData) {
            await setDoc(doc(db, data.linkedFinancePath), data.linkedFinanceData);
        }

        // Czyścimy kosz
        await deleteDoc(trashRef);
    } catch(err) { console.error("Błąd przywracania z kosza:", err); }
}


function updateProjectedBalance() {
    const projectedEl = document.getElementById('company-balance-after-planned');
    if (projectedEl) {
        const projected = currentCompanyTotal - currentTotalPlanned;
        projectedEl.textContent = `${projected.toFixed(2)} zł`;
        projectedEl.style.color = projected >= 0 ? '#38a169' : '#e53e3e';
    }
}

// ==========================================
// 0. AUTORYZACJA (LOGOWANIE / WYLOGOWANIE)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (authView) authView.classList.add('hidden');
        if (mainAppContainer) mainAppContainer.classList.remove('hidden');
        initApp();
        initTrashListener(); // Startujemy nasłuchiwanie kosza
    } else {
        if (authView) authView.classList.remove('hidden');
        if (mainAppContainer) mainAppContainer.classList.add('hidden');
        
        if (projectsUnsubscribe) projectsUnsubscribe();
        if (financesUnsubscribe) financesUnsubscribe();
        if (expensesUnsubscribe) expensesUnsubscribe();
        if (projectUnsubscribe) projectUnsubscribe();
        if (trashUnsubscribe) trashUnsubscribe();
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
            if (authErrorEl) {
                authErrorEl.textContent = "Nieprawidłowy e-mail lub hasło.";
                authErrorEl.style.display = 'block';
            }
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try { await signOut(auth); } catch (error) { console.error(error); }
    });
}

// ==========================================
// GŁÓWNA INICJALIZACJA DANYCH
// ==========================================
function initApp() {
    
    // --- FUNKCJA ZMIENIAJĄCA ZAKŁADKI ---
    const switchTab = (activeTabBtn, activeView) => {
        [tabProjects, tabFinances, tabScanner, tabTrash].forEach(btn => {
            if(btn) btn.classList.remove('active');
        });
        [dashboardView, projectDetailsView, financesView, scannerView, trashView].forEach(view => {
            if(view) view.classList.add('hidden');
        });
        if(activeTabBtn) activeTabBtn.classList.add('active');
        if(activeView) activeView.classList.remove('hidden');
        
        // Resetowanie widoku zlecenia przy wychodzeniu
        if(activeView !== projectDetailsView) {
            if (expensesUnsubscribe) expensesUnsubscribe();
            if (projectUnsubscribe) projectUnsubscribe();
            currentProjectId = null;
        }
    };

    if (tabProjects) tabProjects.addEventListener('click', () => switchTab(tabProjects, dashboardView));
    if (tabFinances) tabFinances.addEventListener('click', () => switchTab(tabFinances, financesView));
    if (tabScanner) tabScanner.addEventListener('click', () => switchTab(tabScanner, scannerView));
    if (tabTrash) tabTrash.addEventListener('click', () => switchTab(tabTrash, trashView));

    // --- DASHBOARD (PROJEKTY) ---
    const projectsRef = collection(db, "projects");
    const projectsQuery = query(projectsRef, orderBy("createdAt", "desc"));

    projectsUnsubscribe = onSnapshot(projectsQuery, (snapshot) => {
        if (!projectsListContainer) return;
        projectsListContainer.innerHTML = ''; 
        if (archivedProjectsListContainer) archivedProjectsListContainer.innerHTML = '';

        let hasActive = false;
        let hasArchived = false;
        let totalReceivables = 0; 
        
        activeProjectsList = []; 

        snapshot.forEach((firestoreDoc) => {
            const project = firestoreDoc.data();
            const projectId = firestoreDoc.id;
            const status = project.status || 'active'; 

            if (status !== 'archived') {
                const remaining = project.total - (project.deposit || 0);
                if (remaining > 0) totalReceivables += remaining;
                activeProjectsList.push({ id: projectId, name: project.name });
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
                        <span>Wpłacono:</span><strong class="text-blue">${project.deposit.toFixed(2)} zł</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Do odbioru:</span><strong style="color: #ed8936;">${(project.total - project.deposit).toFixed(2)} zł</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Wydano na materiały:</span><strong class="text-red" id="card-exp-${projectId}">ładowanie...</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 15px;">
                        <span>Szacowany zysk:</span><strong id="card-profit-${projectId}">...</strong>
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

            // Szybkie odpytanie o wydatki dla kafelka
            onSnapshot(collection(db, "projects", projectId, "expenses"), (expSnap) => {
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
        });

        if (!hasActive && projectsListContainer) projectsListContainer.innerHTML = '<p style="color: #718096;">Brak aktywnych zleceń.</p>';
        if (!hasArchived && archivedProjectsListContainer) archivedProjectsListContainer.innerHTML = '<p style="color: #718096;">Brak projektów w archiwum.</p>';
        
        const receivablesEl = document.getElementById('company-receivables');
        if (receivablesEl) receivablesEl.textContent = `${totalReceivables.toFixed(2)} zł`;
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
    currentProjectTotal = projectData.total; 

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
            currentProjectTotal = data.total; 
            
            if (totalPriceEl) totalPriceEl.textContent = `${currentProjectTotal.toFixed(2)} zł`;
            if (depositEl) depositEl.textContent = `${currentProjectDeposit.toFixed(2)} zł`;
            
            const balance = currentProjectDeposit - currentTotalExpenses;
            if (currentBalanceEl) currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;

            const remainingToPayEl = document.getElementById('remaining-to-pay');
            if (remainingToPayEl) {
                remainingToPayEl.textContent = `${(currentProjectTotal - currentProjectDeposit).toFixed(2)} zł`;
            }

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

// Zabezpieczenie usuwania zlecenia (Przeniesienie do kosza zamiast trwałego usunięcia)
if (btnDeleteProject) {
    btnDeleteProject.addEventListener('click', async () => {
        if(!currentProjectId) return;
        if(confirm("Czy na pewno chcesz przenieść to zlecenie do kosza?")) {
            const ref = doc(db, "projects", currentProjectId);
            const pName = detailsClientName ? detailsClientName.textContent : 'Zlecenie';
            await moveToTrash(ref, `Całe zlecenie: ${pName}`);
            if (btnBackToDashboard) btnBackToDashboard.click(); 
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
                    <!-- Tu jest klucz do synchronizacji - przycisk pamięta o kasie! -->
                    <button class="btn-delete" data-id="${firestoreDoc.id}" data-finance-id="${data.financeId || ''}" title="Przenieś do kosza">🗑️</button>
                </div>
            `;
            expenseListContainer.appendChild(li);
        });

        currentTotalExpenses = totalSum; 
        if (totalExpensesEl) totalExpensesEl.textContent = `${totalSum.toFixed(2)} zł`;
        
        const balance = currentProjectDeposit - totalSum;
        if (currentBalanceEl) currentBalanceEl.textContent = `${balance.toFixed(2)} zł`;

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

// Zapis wydatku wraz z powiązaniem (Fix błędu synchronizacji)
if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (!currentProjectId) return; 

        const name = expenseNameInput.value;
        const cost = parseFloat(expenseCostInput.value);
        
        if (!name || isNaN(cost)) return;

        try {
            const projectName = detailsClientName ? detailsClientName.textContent : ''; 
            
            // 1. NAJPIERW ZAPISUJEMY W KASIE GŁÓWNEJ I ZBIERAMY DOWÓD (ID)
            const financeRef = await addDoc(collection(db, "company_finances"), {
                type: 'expense',
                desc: `Koszt zlecenia (${projectName}): ${name}`,
                amount: cost,
                createdAt: new Date()
            });

            // 2. POTEM ZAPISUJEMY W ZLECENIU WKLEJAJĄC TAM DOWÓD Z KASY
            await addDoc(collection(db, "projects", currentProjectId, "expenses"), {
                name: name,
                cost: cost,
                financeId: financeRef.id, // Magiczne powiązanie!
                createdAt: new Date()
            });

            expenseForm.reset();
        } catch (error) { console.error(error); }
    });
}

// Usuwanie wydatku z wykorzystaniem Kosza
if (expenseListContainer) {
    expenseListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-delete') && currentProjectId) {
            const expenseId = e.target.getAttribute('data-id');
            const financeId = e.target.getAttribute('data-finance-id'); // Sprawdzamy czy ma brata w kasie
            
            if(confirm("Przenieść wydatek do kosza? (Środki wrócą na stan firmy)")) {
                const docRef = doc(db, "projects", currentProjectId, "expenses", expenseId);
                const expenseName = e.target.closest('li').querySelector('strong').innerText;
                
                await moveToTrash(docRef, `Wydatek ze zlecenia: ${expenseName}`, financeId);
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
function renderFinancesList() {
    if (!lastFinancesSnapshot || !financeListContainer) return;
    financeListContainer.innerHTML = '';
    let totalCompanyMoney = 0;
    let hasVisibleItems = false;
    
    if (lastFinancesSnapshot.empty) {
        financeListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak operacji finansowych.</p>';
        if (companyTotalBalanceEl) companyTotalBalanceEl.textContent = '0.00 zł';
        currentCompanyTotal = 0; 
        updateProjectedBalance(); 
        return;
    }

    lastFinancesSnapshot.forEach((firestoreDoc) => {
        const data = firestoreDoc.data();
        const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
        
        if (data.type === 'income') totalCompanyMoney += data.amount;
        else totalCompanyMoney -= data.amount;
        
        if (currentFinanceFilter === 'income' && data.type !== 'income') return;
        if (currentFinanceFilter === 'expense' && data.type !== 'expense') return;
        if (currentFinanceFilter === 'salary' && data.type !== 'withdrawal') return;
        
        hasVisibleItems = true;

        let typeLabel = '';
        let amountColor = '';
        let sign = '';
        
        if (data.type === 'income') { typeLabel = 'Wpływ'; amountColor = 'text-blue'; sign = '+'; } 
        else if (data.type === 'expense') { typeLabel = data.category && data.category !== "Brak" ? `Koszt: ${data.category}` : 'Koszt firmowy'; amountColor = 'text-red'; sign = '-'; } 
        else { typeLabel = 'Wypłata własna'; amountColor = 'text-purple'; sign = '-'; }

        const li = document.createElement('li');
        li.classList.add('expense-item');
        if (data.type === 'withdrawal') li.style.borderLeft = '4px solid #805ad5';
        
        li.innerHTML = `
            <div class="expense-info">
                <strong>${data.desc}</strong>
                <span class="expense-date">${dateObj.toLocaleDateString('pl-PL')} | ${typeLabel}</span>
            </div>
            <div class="expense-actions">
                <span class="expense-amount ${amountColor}" style="${data.type === 'withdrawal' ? 'color: #805ad5;' : ''}">${sign} ${data.amount.toFixed(2)} zł</span>
                <button class="btn-delete finance-delete" data-id="${firestoreDoc.id}" title="Przenieś do kosza">🗑️</button>
            </div>
        `;
        financeListContainer.appendChild(li);
    });

    if (!hasVisibleItems) financeListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak operacji dla wybranego filtru.</p>';
    if (companyTotalBalanceEl) companyTotalBalanceEl.textContent = `${totalCompanyMoney.toFixed(2)} zł`;
    currentCompanyTotal = totalCompanyMoney;
    updateProjectedBalance(); 
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
                type: type, category: category || "Brak", desc: desc, amount: amount, createdAt: new Date()
            });
            financeForm.reset();
        } catch (error) { console.error(error); }
    });
}

if (financeListContainer) {
    financeListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('finance-delete')) {
            const docId = e.target.getAttribute('data-id');
            if(confirm("Przenieść operację do kosza? (Środki zostaną skorygowane)")) {
                const ref = doc(db, "company_finances", docId);
                const desc = e.target.closest('li').querySelector('strong').innerText;
                await moveToTrash(ref, `Wpis w kasie: ${desc}`);
            }
        }
    });
}

const btnEditTotal = document.getElementById('btn-edit-total');
if (btnEditTotal) {
    btnEditTotal.addEventListener('click', async () => {
        if (!currentProjectId) return;
        const newVal = prompt("Podaj nową całkowitą wartość zlecenia (zł):", currentProjectTotal);
        if (newVal === null) return; 
        const parsedVal = parseFloat(newVal);
        if (isNaN(parsedVal) || parsedVal < 0) { alert("Podano nieprawidłową kwotę."); return; }
        try { await updateDoc(doc(db, "projects", currentProjectId), { total: parsedVal }); } 
        catch (error) { console.error(error); }
    });
}

// PLANOWANE WYDATKI
const plannedExpenseForm = document.getElementById('planned-expense-form');
const plannedListContainer = document.getElementById('planned-list-container');
let plannedUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        const plannedRef = collection(db, "planned_expenses");
        const plannedQuery = query(plannedRef, orderBy("dueDate", "asc"));
        
        plannedUnsubscribe = onSnapshot(plannedQuery, (snapshot) => {
            if (!plannedListContainer) return;
            plannedListContainer.innerHTML = '';
            let tempPlannedSum = 0; 

            if (snapshot.empty) {
                plannedListContainer.innerHTML = '<p style="color: #718096; font-size: 14px;">Brak oczekujących płatności. Uff!</p>';
                currentTotalPlanned = 0;
                if(typeof updateProjectedBalance === 'function') updateProjectedBalance();
                return;
            }

            snapshot.forEach((firestoreDoc) => {
                const data = firestoreDoc.data();
                const docId = firestoreDoc.id;
                
                tempPlannedSum += data.amount; 

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
                        <button class="btn btn-primary btn-pay-planned" data-id="${docId}" data-name="${data.name}" data-amount="${data.amount}" style="background-color: #38a169; border-color: #38a169; padding: 4px 8px; font-size: 12px;">Opłać</button>
                        <button class="btn-delete btn-delete-planned" data-id="${docId}" title="Przenieś do kosza">🗑️</button>
                    </div>
                `;
                plannedListContainer.appendChild(li);
            });
            currentTotalPlanned = tempPlannedSum;
            if(typeof updateProjectedBalance === 'function') updateProjectedBalance();
        });
    }
});

if (plannedExpenseForm) {
    plannedExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('planned-name').value;
        const amount = parseFloat(document.getElementById('planned-amount').value);
        const dateString = document.getElementById('planned-date').value;
        if (!name || isNaN(amount) || !dateString) return;
        try {
            await addDoc(collection(db, "planned_expenses"), { name: name, amount: amount, dueDate: dateString, createdAt: new Date() });
            plannedExpenseForm.reset();
        } catch (error) { console.error(error); }
    });
}

if (plannedListContainer) {
    plannedListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-pay-planned')) {
            const docId = e.target.getAttribute('data-id');
            const name = e.target.getAttribute('data-name');
            const amount = parseFloat(e.target.getAttribute('data-amount'));
            try {
                await addDoc(collection(db, "company_finances"), { type: 'expense', category: "Opłaty stałe", desc: name, amount: amount, createdAt: new Date() });
                await deleteDoc(doc(db, "planned_expenses", docId));
            } catch (error) { console.error(error); }
        }

        if (e.target.classList.contains('btn-delete-planned')) {
            const docId = e.target.getAttribute('data-id');
            if(confirm("Przenieść zaplanowaną płatność do kosza?")) {
                const ref = doc(db, "planned_expenses", docId);
                const desc = e.target.closest('li').querySelector('strong').innerText;
                await moveToTrash(ref, `Planowana płatność: ${desc}`);
            }
        }
    });
}

// ==========================================
// PRAWDZIWY SKANER FAKTUR AI (GEMINI)
// ==========================================
const btnScanInvoice = document.getElementById('btn-scan-invoice');
const scannerLoading = document.getElementById('scanner-loading');
const scannerResultsSection = document.getElementById('scanner-results-section');
const scannerItemsContainer = document.getElementById('scanner-items-container');
const btnSaveScannedItems = document.getElementById('btn-save-scanned-items'); // Ta zmienna musi tu zostać dla zielonego przycisku!

// TUTAJ WKLEJ SWÓJ KLUCZ API GOOGLE (ten sam co w Generatorze)
const GEMINI_API_KEY = "AQ.Ab8RN6LMR46DCsmbwdT3E0xH1w6oHzkorJNV6kFeCYGfluavlQ"; 

// Funkcja pomocnicza: zamiana pliku graficznego na kod Base64 (żeby wysłać go do AI)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); 
        reader.onerror = error => reject(error);
    });
}

if (btnScanInvoice) {
    btnScanInvoice.addEventListener('click', async () => {
        const fileInput = document.getElementById('invoice-upload-input');
        const file = fileInput.files[0];
        
        if (!file) {
            alert("Najpierw zrób zdjęcie lub wybierz plik z fakturą!");
            return;
        }

        scannerLoading.style.display = 'block';
        scannerLoading.textContent = "Sztuczna inteligencja czyta fakturę... (to może potrwać do 10 sekund)";
        scannerResultsSection.classList.add('hidden');
        btnScanInvoice.disabled = true;

        try {
            // 1. Konwersja zdjęcia (z zabezpieczeniem formatu dla iPhone'ów)
            const base64Image = await fileToBase64(file);
            const mimeType = file.type || "image/jpeg"; 

            const promptText = `Przeanalizuj to zdjęcie faktury z hurtowni stolarskiej. 
            Wypisz wszystkie pozycje materiałowe oraz ich ostateczne ceny brutto. 
            MUSISZ zwrócić wynik w formacie JSON jako tablicę obiektów.
            Wymagany format: [{"name": "nazwa materiału", "price": 12.34}]`;

            // 2. Strzał do API Google z nowym wymuszeniem formatu JSON
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType: mimeType, data: base64Image } }
                        ]
                    }],
                    // To zmusza Google do idealnie czystego kodu
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            // 3. Sprawdzamy czy Google nie zablokowało zapytania
            if (!response.ok) {
                const errData = await response.json();
                // Wyrzucamy prawdziwy komunikat od Google
                throw new Error(errData.error?.message || `Błąd sieciowy: kod ${response.status}`);
            }

            const data = await response.json();
            
            // 4. Odczytujemy i budujemy tabelkę
            const textResult = data.candidates[0].content.parts[0].text;
            const recognizedItems = JSON.parse(textResult);

            scannerItemsContainer.innerHTML = '';
            const projectOptions = activeProjectsList.map(p => `<option value="${p.id}">Zlecenie: ${p.name}</option>`).join('');

            recognizedItems.forEach((item) => {
                const itemDiv = document.createElement('div');
                itemDiv.style = "display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px;";
                itemDiv.innerHTML = `
                    <div style="flex: 1; min-width: 200px;">
                        <strong style="display: block; margin-bottom: 4px;">${item.name}</strong>
                        <span style="color: #e53e3e; font-weight: bold;">${item.price.toFixed(2)} zł</span>
                    </div>
                    <div style="flex: 1; min-width: 200px;">
                        <select class="scanned-item-assign" data-name="${item.name}" data-price="${item.price}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                            <option value="company_expense">Koszty ogólne warsztatu</option>
                            ${projectOptions}
                        </select>
                    </div>
                `;
                scannerItemsContainer.appendChild(itemDiv);
            });

            scannerLoading.style.display = 'none';
            scannerResultsSection.classList.remove('hidden');

        } catch (error) {
            console.error("Błąd Skanera:", error);
            // TUTAJ MAGIA: Wyświetlamy konkretny powód wysypania się błędu!
            alert("Błąd: " + error.message);
            scannerLoading.style.display = 'none';
        } finally {
            btnScanInvoice.disabled = false;
            scannerLoading.textContent = "AI analizuje fakturę... to potrwa kilka sekund.";
        }
    });
}

// ZAPISYWANIE ROZPOZNANYCH POZYCJI (WRAZ Z WDROŻONYM LINKOWANIEM KASY)
if (btnSaveScannedItems) {
    btnSaveScannedItems.addEventListener('click', async () => {
        const selects = document.querySelectorAll('.scanned-item-assign');
        if (selects.length === 0) return;

        btnSaveScannedItems.disabled = true;
        const originalText = btnSaveScannedItems.textContent;
        btnSaveScannedItems.textContent = "Księgowanie w tle...";

        try {
            for (const select of selects) {
                const itemName = select.getAttribute('data-name');
                const itemPrice = parseFloat(select.getAttribute('data-price'));
                const targetId = select.value;

                if (targetId === 'company_expense') {
                    await addDoc(collection(db, "company_finances"), {
                        type: 'expense', category: 'Materiały ogólne', desc: `Faktura (Skaner AI): ${itemName}`, amount: itemPrice, createdAt: new Date()
                    });
                } else {
                    const projectName = select.options[select.selectedIndex].text.replace('Zlecenie: ', '');
                    const financeRef = await addDoc(collection(db, "company_finances"), {
                        type: 'expense', desc: `Koszt zlecenia (${projectName}): ${itemName}`, amount: itemPrice, createdAt: new Date()
                    });
                    
                    // Magiczne powiązanie wydatku z jego odbiciem w kasie!
                    await addDoc(collection(db, "projects", targetId, "expenses"), {
                        name: itemName, cost: itemPrice, financeId: financeRef.id, createdAt: new Date()
                    });
                }
            }
            alert("Księgowanie zakończone sukcesem!");
            document.getElementById('scanner-items-container').innerHTML = '';
            document.getElementById('scanner-results-section').classList.add('hidden');
            document.getElementById('invoice-upload-input').value = '';
            if (tabProjects) tabProjects.click();
        } catch (error) { console.error(error); } 
        finally { btnSaveScannedItems.disabled = false; btnSaveScannedItems.textContent = originalText; }
    });
}

// ==========================================
// NASŁUCHIWANIE I OBSŁUGA KOSZA
// ==========================================
function initTrashListener() {
    const trashRef = collection(db, "trash");
    const trashQ = query(trashRef, orderBy("deletedAt", "desc"));
    const container = document.getElementById('trash-list-container');

    trashUnsubscribe = onSnapshot(trashQ, (snapshot) => {
        if (!container) return;
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p style="color: #718096; font-size: 14px;">Twój kosz jest pusty.</p>';
            return;
        }

        snapshot.forEach((firestoreDoc) => {
            const data = firestoreDoc.data();
            const dateObj = data.deletedAt ? data.deletedAt.toDate() : new Date();
            
            const li = document.createElement('li');
            li.classList.add('expense-item');
            li.innerHTML = `
                <div class="expense-info">
                    <strong style="color: #4a5568; text-decoration: line-through;">${data.desc}</strong>
                    <span class="expense-date">Usunięto: ${dateObj.toLocaleString('pl-PL')}</span>
                </div>
                <div class="expense-actions" style="display: flex; gap: 8px;">
                    <button class="btn btn-primary btn-restore" data-id="${firestoreDoc.id}" style="background-color: #3182ce; border-color: #3182ce; padding: 4px 8px; font-size: 12px;">Przywróć</button>
                    <button class="btn-delete btn-delete-permanent" data-id="${firestoreDoc.id}" title="Usuń trwale">🗑️</button>
                </div>
            `;
            container.appendChild(li);
        });
    });

    if (container) {
        container.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-restore')) {
                const docId = e.target.getAttribute('data-id');
                e.target.disabled = true;
                e.target.textContent = "Czekaj...";
                await restoreFromTrash(docId);
            }
            if (e.target.classList.contains('btn-delete-permanent')) {
                if(confirm("Czy na pewno chcesz usunąć to bezpowrotnie z bazy?")) {
                    const docId = e.target.getAttribute('data-id');
                    await deleteDoc(doc(db, "trash", docId));
                }
            }
        });
    }
}