// State
let medications = JSON.parse(localStorage.getItem('medications')) || [];
let viewDate = new Date(); // The date currently being viewed

// Telegram Integration Helpers
function isTelegram() {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
}

const tg = window.Telegram ? window.Telegram.WebApp : null;

if (isTelegram()) {
    tg.ready();
    tg.expand();
    
    // Sync Telegram Theme
    function syncTelegramTheme() {
        const theme = tg.themeParams;
        if (theme.bg_color) document.documentElement.style.setProperty('--bg-color', theme.bg_color);
        if (theme.text_color) document.documentElement.style.setProperty('--text-primary', theme.text_color);
        if (theme.hint_color) document.documentElement.style.setProperty('--text-secondary', theme.hint_color);
        if (theme.button_color) document.documentElement.style.setProperty('--primary', theme.button_color);
        if (theme.secondary_bg_color) document.documentElement.style.setProperty('--surface-color', theme.secondary_bg_color);
    }
    
    syncTelegramTheme();
    tg.onEvent('themeChanged', syncTelegramTheme);
}

// DOM Elements
const dateEl = document.getElementById('current-date');
const todayBtn = document.getElementById('today-btn');
const tgAddBtn = document.getElementById('tg-add-btn');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const emptyStateEl = document.getElementById('empty-state');
const medListEl = document.getElementById('med-list');
const fabBtn = document.getElementById('fab');

if (isTelegram()) {
    fabBtn.style.display = 'none';
    tgAddBtn.classList.remove('hidden');
    tgAddBtn.addEventListener('click', openModal);
}

const addModal = document.getElementById('add-modal');
const cancelBtn = document.getElementById('cancel-btn');
const addForm = document.getElementById('add-form');
const notificationBanner = document.getElementById('notification-banner');
const enableNotificationsBtn = document.getElementById('enable-notifications');

// Data Migration: lastTakenDate -> takenDates [], add createdAt
let migrated = false;
medications = medications.map(med => {
    if (med.lastTakenDate !== undefined) {
        med.takenDates = med.lastTakenDate ? [med.lastTakenDate] : [];
        delete med.lastTakenDate;
        migrated = true;
    }
    if (!med.takenDates) med.takenDates = [];
    if (!med.createdAt) {
        // Default to project start date or earliest taken date
        med.createdAt = med.takenDates.length > 0 ? med.takenDates.sort()[0] : "2026-03-24";
        migrated = true;
    }
    return med;
});
if (migrated) localStorage.setItem('medications', JSON.stringify(medications));

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Registration failed', err));
    });
}

// Utility: Get date string in YYYY-MM-DD format for a given Date object
function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayString() {
    return getDateString(new Date());
}

// Utility: Format date for header
function updateHeaderDate() {
    const todayStr = getTodayString();
    const viewStr = getDateString(viewDate);
    
    // Toggle Today button
    if (viewStr === todayStr) {
        todayBtn.classList.add('hidden');
    } else {
        todayBtn.classList.remove('hidden');
    }

    let displayStr = "";
    const diffDays = Math.round((viewDate.setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) displayStr = "Today";
    else if (diffDays === -1) displayStr = "Yesterday";
    else if (diffDays === 1) displayStr = "Tomorrow";
    else {
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        displayStr = viewDate.toLocaleDateString(undefined, options);
    }

    if (dateEl.textContent !== displayStr) {
        dateEl.textContent = displayStr;
    }
}

// Navigation Handlers
prevDayBtn.addEventListener('click', () => changeDate(-1));
nextDayBtn.addEventListener('click', () => changeDate(1));
todayBtn.addEventListener('click', () => {
    viewDate = new Date();
    renderMeds();
});

function changeDate(days) {
    const animationClass = days > 0 ? 'swipe-left' : 'swipe-right';
    medListEl.classList.add(animationClass);
    
    setTimeout(() => {
        viewDate.setDate(viewDate.getDate() + days);
        renderMeds();
        medListEl.classList.remove(animationClass);
    }, 150);
}

// Swipe Support
let touchStartX = 0;
let touchEndX = 0;

const mainContainer = document.querySelector('main');
mainContainer.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, false);

mainContainer.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, false);

function handleSwipe() {
    const threshold = 50;
    if (touchEndX < touchStartX - threshold) {
        changeDate(1); // Swipe left -> Next day
    }
    if (touchEndX > touchStartX + threshold) {
        changeDate(-1); // Swipe right -> Previous day
    }
}

// Save to LocalStorage
function saveMeds() {
    medications.sort((a, b) => a.time.localeCompare(b.time));
    localStorage.setItem('medications', JSON.stringify(medications));
    renderMeds();
}

// Render Medications
function renderMeds() {
    updateHeaderDate();
    const viewStr = getDateString(viewDate);
    const visibleMeds = medications.filter(med => med.createdAt <= viewStr);

    if (visibleMeds.length === 0) {
        emptyStateEl.style.display = 'flex';
        medListEl.innerHTML = '';
        return;
    }

    emptyStateEl.style.display = 'none';
    medListEl.innerHTML = '';

    visibleMeds.forEach(med => {
        const isTaken = med.takenDates.includes(viewStr);

        const li = document.createElement('li');
        li.className = `med-item ${isTaken ? 'taken' : ''}`;
        
        li.innerHTML = `
            <label class="checkbox-container">
                <input type="checkbox" ${isTaken ? 'checked' : ''} data-id="${med.id}">
                <span class="checkmark"></span>
            </label>
            <div class="med-info">
                <span class="med-name">${med.name}</span>
                <span class="med-time">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:-2px;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    ${formatTime(med.time)}
                </span>
            </div>
            <button class="delete-btn" aria-label="Delete Medication" data-id="${med.id}">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        medListEl.appendChild(li);
    });

    // Attach Event Listeners
    document.querySelectorAll('.checkbox-container input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => toggleMed(e.target.dataset.id, e.target.checked));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm(`Delete ${medications.find(m => m.id === e.currentTarget.dataset.id)?.name}?`)) {
                deleteMed(e.currentTarget.dataset.id);
            }
        });
    });
}

// Toggle Medication Status for the current viewDate
function toggleMed(id, isChecked) {
    const med = medications.find(m => m.id === id);
    if (med) {
        const viewStr = getDateString(viewDate);
        if (isChecked) {
            if (!med.takenDates.includes(viewStr)) {
                med.takenDates.push(viewStr);
            }
            if (isTelegram()) tg.HapticFeedback.notificationOccurred('success');
        } else {
            med.takenDates = med.takenDates.filter(d => d !== viewStr);
            if (isTelegram()) tg.HapticFeedback.impactOccurred('light');
        }
        saveMeds();
    }
}

// Delete Medication
function deleteMed(id) {
    medications = medications.filter(m => m.id !== id);
    if (isTelegram()) tg.HapticFeedback.notificationOccurred('warning');
    saveMeds();
}

// Add Medication
addForm.addEventListener('submit', handleAddMed);

function handleAddMed(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('med-name');
    const timeInput = document.getElementById('med-time');
    
    if (!nameInput.value.trim()) {
        if (isTelegram()) tg.showAlert('Please enter a medication name');
        return;
    }

    const newMed = {
        id: Date.now().toString(),
        name: nameInput.value.trim(),
        time: timeInput.value,
        takenDates: [],
        createdAt: getTodayString(),
        lastNotifiedDate: null
    };

    medications.push(newMed);
    saveMeds();
    
    // Reset and close
    addForm.reset();
    closeModal();
    if (isTelegram()) tg.HapticFeedback.notificationOccurred('success');
}

// Format Time (HH:MM to 12h format string)
function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10));
    d.setMinutes(parseInt(m, 10));
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Modal Handlers
fabBtn.addEventListener('click', openModal);

function openModal() {
    addModal.classList.remove('hidden');
    const d = new Date();
    document.getElementById('med-time').value = `${String(d.getHours()).padStart(2, '0')}:00`;
    document.getElementById('med-name').focus();

    if (isTelegram()) {
        tg.MainButton.setText("SAVE MEDICATION");
        tg.MainButton.show();
        tg.MainButton.onClick(handleAddMed);
    }
}

function closeModal() {
    addModal.classList.add('hidden');
    addForm.reset();
    if (isTelegram()) {
        tg.MainButton.hide();
        tg.MainButton.offClick(handleAddMed);
    }
}

cancelBtn.addEventListener('click', closeModal);
addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeModal();
});

// === Notification Logic ===
function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone);
}

function checkNotificationPermissions() {
    if (isIOS() && !isStandalone()) {
        if (notificationBanner) {
            const bannerText = notificationBanner.querySelector('p');
            if (bannerText) bannerText.textContent = "Tap Share then 'Add to Home Screen' to enable notifications.";
            notificationBanner.classList.remove('hidden');
        }
        if (enableNotificationsBtn) enableNotificationsBtn.classList.add('hidden');
        return;
    }

    if (!('Notification' in window)) {
        if (notificationBanner) notificationBanner.classList.add('hidden');
        return;
    }

    if (Notification.permission === 'default') {
        if (notificationBanner) notificationBanner.classList.remove('hidden');
        if (enableNotificationsBtn) enableNotificationsBtn.classList.remove('hidden');
    } else if (Notification.permission === 'granted') {
        if (notificationBanner) notificationBanner.classList.add('hidden');
    }
}

if (enableNotificationsBtn) {
    enableNotificationsBtn.addEventListener('click', () => {
        if (!('Notification' in window)) return;
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                notificationBanner.classList.add('hidden');
            }
        });
    });
}

function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    const today = getTodayString();
    const pendingCount = medications.filter(med => !med.takenDates.includes(today)).length;
    if (pendingCount > 0) {
        navigator.setAppBadge(pendingCount).catch(() => {});
    } else {
        navigator.clearAppBadge().catch(() => {});
    }
}

let lastCheckedTime = '';
function checkAlarms() {
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;
    
    if (currentTime === lastCheckedTime) return;
    lastCheckedTime = currentTime;
    
    const today = getTodayString();
    let updated = false;

    medications.forEach(med => {
        if (med.time === currentTime && med.lastNotifiedDate !== today && !med.takenDates.includes(today)) {
            sendNotification(med);
            med.lastNotifiedDate = today;
            updated = true;
        }
    });

    if (updated) localStorage.setItem('medications', JSON.stringify(medications));
    updateIconsAndBadge();
}

function sendNotification(med) {
    const options = {
        body: `It's time to take your medication: ${med.name}`,
        icon: 'icon.svg',
        vibrate: [200, 100, 200],
        tag: 'med-reminder-' + med.id,
        renotify: true
    };

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(`Medication Reminder`, options);
        }).catch(() => new Notification(`Medication Reminder`, options));
    } else {
        new Notification(`Medication Reminder`, options);
    }
}

function updateIconsAndBadge() {
    updateBadge();
}

// Initialization
updateHeaderDate();
renderMeds();
checkNotificationPermissions();
updateIconsAndBadge();

// Interval for alarms and date updates
setInterval(() => {
    checkAlarms();
    // If we're looking at "Today", make sure the time/header stays fresh
    if (getDateString(viewDate) === getTodayString()) {
        updateHeaderDate();
    }
}, 10000);
