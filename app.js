// State
let medications = JSON.parse(localStorage.getItem('medications')) || [];

// DOM Elements
const dateEl = document.getElementById('current-date');
const emptyStateEl = document.getElementById('empty-state');
const medListEl = document.getElementById('med-list');
const fabBtn = document.getElementById('fab');
const addModal = document.getElementById('add-modal');
const cancelBtn = document.getElementById('cancel-btn');
const addForm = document.getElementById('add-form');
const notificationBanner = document.getElementById('notification-banner');
const enableNotificationsBtn = document.getElementById('enable-notifications');

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Registration failed', err));
    });
}

// Utility: Get current date in YYYY-MM-DD format based on local timezone
function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Utility: Format date for header
function updateHeaderDate() {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString(undefined, options);
    if (dateEl.textContent !== dateStr) {
        dateEl.textContent = dateStr;
    }
}

// Save to LocalStorage
function saveMeds() {
    // Sort medications by time
    medications.sort((a, b) => a.time.localeCompare(b.time));
    localStorage.setItem('medications', JSON.stringify(medications));
    renderMeds();
}

// Check and Reset at Midnight logic
function checkMidnightReset() {
    const today = getTodayString();
    let updated = false;
    
    medications.forEach(med => {
        if (med.lastTakenDate && med.lastTakenDate !== today) {
            med.lastTakenDate = null;
            updated = true;
        }
        // Also clean up old notifications for testing/robustness
        if (med.lastNotifiedDate && med.lastNotifiedDate !== today) {
            med.lastNotifiedDate = null;
            updated = true;
        }
    });

    return updated; // Caller decides if they want to saveMeds/renderMeds
}

// Render Medications
function renderMeds() {
    // Before rendering, softly check midnight reset.
    // We do NOT call saveMeds here because saveMeds calls renderMeds (infinite loop).
    const needsReset = checkMidnightReset();
    if (needsReset) {
        // Just save directly to avoid infinite loop with saveMeds
        localStorage.setItem('medications', JSON.stringify(medications));
    }

    if (medications.length === 0) {
        emptyStateEl.style.display = 'flex';
        medListEl.innerHTML = '';
        return;
    }

    emptyStateEl.style.display = 'none';
    medListEl.innerHTML = '';

    const today = getTodayString();

    medications.forEach(med => {
        const isTaken = med.lastTakenDate === today;

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
            const id = e.currentTarget.dataset.id;
            deleteMed(id);
        });
    });
}

// Toggle Medication Status
function toggleMed(id, isChecked) {
    const med = medications.find(m => m.id === id);
    if (med) {
        med.lastTakenDate = isChecked ? getTodayString() : null;
        saveMeds();
    }
}

// Delete Medication
function deleteMed(id) {
    // Only delete with very light confirm prompt via window confirm for simplicity, 
    // or just delete instantly if no complex modal is desired. We'll delete directly for better UX.
    medications = medications.filter(m => m.id !== id);
    saveMeds();
}

// Add Medication
addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('med-name');
    const timeInput = document.getElementById('med-time');

    const newMed = {
        id: Date.now().toString(),
        name: nameInput.value.trim(),
        time: timeInput.value,
        lastTakenDate: null,
        lastNotifiedDate: null
    };

    medications.push(newMed);
    saveMeds();
    
    // Reset and close
    addForm.reset();
    closeModal();
});

// Format Time (HH:MM to 12h format string)
function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10));
    d.setMinutes(parseInt(m, 10));
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Modal Handlers
fabBtn.addEventListener('click', () => {
    addModal.classList.remove('hidden');
    // Set default time to current time rounded to nearest hour
    const d = new Date();
    document.getElementById('med-time').value = `${String(d.getHours()).padStart(2, '0')}:00`;
    document.getElementById('med-name').focus();
});

function closeModal() {
    addModal.classList.add('hidden');
    addForm.reset();
}

cancelBtn.addEventListener('click', closeModal);
addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeModal();
});

// === Notification Logic ===
function checkNotificationPermissions() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        notificationBanner.classList.remove('hidden');
    } else if (Notification.permission === 'granted') {
        notificationBanner.classList.add('hidden');
    }
}

enableNotificationsBtn.addEventListener('click', () => {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            notificationBanner.classList.add('hidden');
        }
    });
});

function checkAlarms() {
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;
    const today = getTodayString();

    let updated = false;

    medications.forEach(med => {
        if (med.time === currentTime && med.lastNotifiedDate !== today && med.lastTakenDate !== today) {
            sendNotification(med);
            med.lastNotifiedDate = today;
            updated = true;
        }
    });

    if (updated) {
        localStorage.setItem('medications', JSON.stringify(medications));
        // We don't renderMeds here to avoid unnecessarily interrupting UI if they are engaging with it
    }
}

function sendNotification(med) {
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(`Time for ${med.name}`, {
                    body: `It's time to take your medication.`,
                    icon: './icon.svg',
                    vibrate: [200, 100, 200],
                    tag: 'med-reminder-' + med.id, // Group notifications
                    renotify: true
                });
            });
        } else {
            new Notification(`Time for ${med.name}`, {
                body: `It's time to take your medication.`,
                icon: './icon.svg'
            });
        }
    } catch(e) {
        console.error("Notification failed", e);
    }
}

// Initialization
updateHeaderDate();
renderMeds();
checkNotificationPermissions();

// Check for alarms and midnight resets every 10 seconds
setInterval(() => {
    updateHeaderDate();
    checkAlarms();
    if (checkMidnightReset()) {
        renderMeds();
    }
}, 10000);
