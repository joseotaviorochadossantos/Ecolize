const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const HOURS = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const RESPONSES_KEY = 'ecolize-disponibilidade-v2';
const RESET_PASSWORD = 'ZE';

const calendarBody = document.getElementById('calendarBody');
const statusText = document.getElementById('statusText');
const usernameInput = document.getElementById('username');
const participantSummary = document.getElementById('participantSummary');
const participantsList = document.getElementById('participantsList');
const emptyParticipants = document.getElementById('emptyParticipants');
const legendMax = document.getElementById('legendMax');

let participants = {};
let currentUserId = '';

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', isError);
}

function readParticipants() {
  const saved = localStorage.getItem(RESPONSES_KEY);
  if (!saved) return {};

  const parsed = JSON.parse(saved);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('As respostas salvas estão em um formato inválido.');
  }

  return parsed;
}

function saveParticipants() {
  try {
    localStorage.setItem(RESPONSES_KEY, JSON.stringify(participants));
    return true;
  } catch {
    showStatus('Não foi possível salvar. O armazenamento do navegador pode estar cheio ou bloqueado.', true);
    return false;
  }
}

function buildCalendar() {
  const fragment = document.createDocumentFragment();

  HOURS.forEach((hour, hourIndex) => {
    const row = document.createElement('tr');
    const timeCell = document.createElement('th');
    timeCell.className = 'time-label';
    timeCell.scope = 'row';
    timeCell.textContent = hour;
    row.appendChild(timeCell);

    DAYS.forEach((day, dayIndex) => {
      const cell = document.createElement('td');
      const button = document.createElement('button');
      const availableCount = document.createElement('span');
      const key = `${dayIndex}-${hourIndex}`;

      button.className = 'slot-button';
      button.type = 'button';
      button.dataset.key = key;
      button.dataset.level = '0';
      button.disabled = true;
      button.setAttribute('aria-label', `${day}, ${hour}. Entre com seu nome para marcar.`);
      button.addEventListener('click', () => markSlot(key));

      availableCount.className = 'available-count';
      availableCount.textContent = '0';

      button.append(availableCount);
      cell.appendChild(button);
      row.appendChild(cell);
    });

    fragment.appendChild(row);
  });

  calendarBody.replaceChildren(fragment);
}

function getVoteCounts(key) {
  const availableNames = [];

  Object.values(participants).forEach((participant) => {
    if (!participant || typeof participant !== 'object' || !participant.votes) return;
    const vote = participant.votes[key];
    if (vote === 'available') availableNames.push(participant.displayName);
  });

  return {
    availableNames,
    available: availableNames.length
  };
}

function renderCalendar() {
  const buttons = [...calendarBody.querySelectorAll('.slot-button')];
  const countsByKey = buttons.map((button) => [button.dataset.key, getVoteCounts(button.dataset.key)]);
  const highestCount = Math.max(0, ...countsByKey.map(([, counts]) => counts.available));

  legendMax.textContent = `${highestCount} ${highestCount === 1 ? 'pessoa' : 'pessoas'}`;
  participantSummary.textContent = `${Object.keys(participants).length} ${Object.keys(participants).length === 1 ? 'participante' : 'participantes'} neste navegador`;

  countsByKey.forEach(([key, counts], index) => {
    const button = buttons[index];
    const availableCount = button.querySelector('.available-count');
    const vote = currentUserId ? participants[currentUserId]?.votes?.[key] : '';
    const level = counts.available === 0
      ? 0
      : Math.min(4, Math.ceil((counts.available / highestCount) * 4));
    const [dayIndex, hourIndex] = key.split('-').map(Number);
    const slotLabel = `${DAYS[dayIndex]}, ${HOURS[hourIndex]}`;

    availableCount.textContent = String(counts.available);
    button.dataset.level = String(level);
    button.classList.toggle('is-mine', vote === 'available');
    button.disabled = !currentUserId;
    button.title = `${slotLabel}: ${counts.available} ${counts.available === 1 ? 'pessoa disponível' : 'pessoas disponíveis'}. ${counts.availableNames.length ? `Disponíveis: ${counts.availableNames.join(', ')}.` : 'Nenhuma pessoa marcou disponibilidade.'}`;
    button.setAttribute(
      'aria-label',
      `${slotLabel}: ${counts.available} ${counts.available === 1 ? 'pessoa disponível' : 'pessoas disponíveis'}; quem não marcou está indisponível${vote === 'available' ? '. Você marcou disponível.' : currentUserId ? '. Você não marcou e está indisponível.' : '.'}`
    );
  });

  renderParticipants();
}

function renderParticipants() {
  const peopleWhoEntered = Object.values(participants)
    .filter((participant) => participant?.displayName)
    .sort((first, second) => first.displayName.localeCompare(second.displayName, 'pt-BR'));
  const fragment = document.createDocumentFragment();

  peopleWhoEntered.forEach((participant) => {
    const votes = participant.votes || {};
    const availableSlotsByDay = DAYS.map((day, dayIndex) => ({
      day,
      hours: HOURS.filter((_, hourIndex) => votes[`${dayIndex}-${hourIndex}`] === 'available')
    })).filter(({ hours }) => hours.length > 0);
    const availableCount = availableSlotsByDay.reduce((total, { hours }) => total + hours.length, 0);
    const item = document.createElement('li');
    const header = document.createElement('div');
    const name = document.createElement('span');
    const summary = document.createElement('span');
    const schedule = document.createElement('div');

    item.className = 'participant-item';
    header.className = 'participant-head';
    name.className = 'participant-name';
    name.textContent = participant.displayName;
    summary.className = 'participant-votes';
    summary.textContent = `${availableCount} ${availableCount === 1 ? 'horário disponível' : 'horários disponíveis'}`;
    header.append(name, summary);
    schedule.className = 'participant-schedule';

    if (availableSlotsByDay.length === 0) {
      const noAvailability = document.createElement('p');
      noAvailability.className = 'participant-no-schedule';
      noAvailability.textContent = 'Nenhum horário marcado como disponível.';
      schedule.appendChild(noAvailability);
    } else {
      availableSlotsByDay.forEach(({ day, hours }) => {
        const dayRow = document.createElement('p');
        const dayName = document.createElement('strong');
        const times = document.createElement('span');

        dayRow.className = 'participant-day';
        dayName.textContent = `${day}:`;
        times.textContent = hours.join(', ');
        dayRow.append(dayName, times);
        schedule.appendChild(dayRow);
      });
    }

    item.append(header, schedule);
    fragment.appendChild(item);
  });

  participantsList.replaceChildren(fragment);
  emptyParticipants.hidden = peopleWhoEntered.length > 0;
  participantsList.hidden = peopleWhoEntered.length === 0;
}

function markSlot(key) {
  if (!currentUserId) {
    showStatus('Entre com seu nome antes de marcar os horários.', true);
    return;
  }

  const participant = participants[currentUserId];
  const previousVote = participant.votes[key];

  if (previousVote === 'available') {
    delete participant.votes[key];
  } else {
    participant.votes[key] = 'available';
  }

  if (!saveParticipants()) {
    if (previousVote) participant.votes[key] = previousVote;
    else delete participant.votes[key];
    renderCalendar();
    return;
  }

  renderCalendar();
  showStatus(`Resposta atualizada para ${participant.displayName}.`);
}

function enterAsParticipant(event) {
  event.preventDefault();
  const displayName = usernameInput.value.trim();

  if (!displayName) {
    showStatus('Digite seu nome para entrar.', true);
    return;
  }

  const participantId = displayName.toLocaleLowerCase('pt-BR');
  const previousUserId = currentUserId;
  const existingParticipant = participants[participantId];
  const previousDisplayName = existingParticipant?.displayName;

  currentUserId = participantId;
  if (!existingParticipant) {
    participants[participantId] = { displayName, votes: {} };
  } else {
    existingParticipant.displayName = displayName;
  }

  if (!saveParticipants()) {
    if (existingParticipant) existingParticipant.displayName = previousDisplayName;
    else delete participants[participantId];
    currentUserId = previousUserId;
    renderCalendar();
    return;
  }

  usernameInput.value = displayName;
  renderCalendar();
  showStatus(`Você entrou como ${displayName}.`);
}

function resetResponses(event) {
  event.preventDefault();

  const passwordInput = document.getElementById('resetPassword');
  if (passwordInput.value !== RESET_PASSWORD) {
    passwordInput.value = '';
    showStatus('Senha incorreta. As respostas não foram apagadas.', true);
    return;
  }

  passwordInput.value = '';
  if (!window.confirm('Apagar todas as respostas salvas neste navegador? Esta ação não pode ser desfeita.')) return;

  const previousParticipants = participants;
  participants = {};
  if (!saveParticipants()) {
    participants = previousParticipants;
    renderCalendar();
    return;
  }

  currentUserId = '';
  renderCalendar();
  showStatus('Respostas deste navegador apagadas. Você já pode começar uma nova rodada.');
}

function setActiveView(view) {
  const isCalendar = view === 'calendar';
  document.getElementById('calendarTab').classList.toggle('is-active', isCalendar);
  document.getElementById('calendarTab').setAttribute('aria-selected', String(isCalendar));
  document.getElementById('participantsTab').classList.toggle('is-active', !isCalendar);
  document.getElementById('participantsTab').setAttribute('aria-selected', String(!isCalendar));
  document.getElementById('calendarView').hidden = !isCalendar;
  document.getElementById('participantsView').hidden = isCalendar;
}

document.getElementById('loginForm').addEventListener('submit', enterAsParticipant);
document.getElementById('resetForm').addEventListener('submit', resetResponses);
document.getElementById('calendarTab').addEventListener('click', () => setActiveView('calendar'));
document.getElementById('participantsTab').addEventListener('click', () => setActiveView('participants'));
document.querySelector('.view-tabs').addEventListener('keydown', (event) => {
  const tabs = [...document.querySelectorAll('.view-tab')];
  const currentIndex = tabs.indexOf(document.activeElement);
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;

  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

buildCalendar();

try {
  participants = readParticipants();
} catch {
  participants = {};
  showStatus('Não foi possível carregar as respostas salvas. Os dados armazenados podem estar inválidos.', true);
}

renderCalendar();