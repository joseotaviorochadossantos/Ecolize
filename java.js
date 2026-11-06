const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const HOURS = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const SUPABASE_URL = 'https://ynbbxbphxuxtfdgydqbd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fYma_eFlTBJqcZ5RrPyW4A_BPVL69G_';
const RESPONSES_ENDPOINT = `${SUPABASE_URL}/rest/v1/availability_responses`;
const REFRESH_INTERVAL_MS = 15000;
const TABLE_BACKGROUND_INTERVAL_MS = 7000;

const calendarBody = document.getElementById('calendarBody');
const statusText = document.getElementById('statusText');
const usernameInput = document.getElementById('username');
const loginButton = document.querySelector('#loginForm button[type="submit"]');
const participantSummary = document.getElementById('participantSummary');
const participantsList = document.getElementById('participantsList');
const emptyParticipants = document.getElementById('emptyParticipants');
const legendMax = document.getElementById('legendMax');
const tableBackgroundLayers = [
  document.getElementById('tableBackgroundA'),
  document.getElementById('tableBackgroundB')
];

let participants = {};
let currentUserId = '';
let hasLoadedOnce = false;
let isSaving = false;
let activeBackgroundLayer = 0;
let currentBackgroundIndex = 0;

const tableBackgroundImages = Array.from(
  { length: 20 },
  (_, index) => `./img/${index + 2}.jpeg`
);

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('is-error', isError);
}

function getRequestHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

async function getErrorMessage(response) {
  const responseText = await response.text();
  if (!responseText) return `${response.status} ${response.statusText}`;

  try {
    const body = JSON.parse(responseText);
    return body.message || body.error_description || body.error || responseText;
  } catch {
    return responseText;
  }
}

async function loadParticipants({ quiet = false } = {}) {
  try {
    const response = await fetch(`${RESPONSES_ENDPOINT}?select=id,display_name,votes`, {
      headers: getRequestHeaders(),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error('O Supabase retornou uma resposta em formato inválido.');
    }

    participants = Object.fromEntries(
      rows.map((row) => [
        row.id,
        { displayName: row.display_name, votes: row.votes || {} }
      ])
    );
    hasLoadedOnce = true;
    loginButton.disabled = false;
    renderCalendar();

    if (!quiet) showStatus('Conectado ao Supabase. As respostas estão atualizadas.');
    return true;
  } catch (error) {
    showStatus(
      `Não foi possível conectar ao Supabase: ${error.message}. Confira a tabela, as políticas do SQL e abra o site pelo Live Server.`,
      true
    );
    return false;
  }
}

async function saveParticipant(participant) {
  isSaving = true;
  loginButton.disabled = true;
  renderCalendar();

  try {
    const response = await fetch(`${RESPONSES_ENDPOINT}?on_conflict=id`, {
      method: 'POST',
      headers: getRequestHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        id: currentUserId,
        display_name: participant.displayName,
        votes: participant.votes,
        updated_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return true;
  } catch (error) {
    showStatus(`Não foi possível salvar no Supabase: ${error.message}.`, true);
    return false;
  } finally {
    isSaving = false;
    loginButton.disabled = !hasLoadedOnce;
    renderCalendar();
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
  participantSummary.textContent = `${Object.keys(participants).length} ${Object.keys(participants).length === 1 ? 'participante' : 'participantes'} no grupo`;

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
    button.disabled = !currentUserId || !hasLoadedOnce || isSaving;
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

async function markSlot(key) {
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

  if (!await saveParticipant(participant)) {
    if (previousVote) participant.votes[key] = previousVote;
    else delete participant.votes[key];
    renderCalendar();
    return;
  }

  showStatus(`Resposta atualizada para ${participant.displayName}.`);
}

async function enterAsParticipant(event) {
  event.preventDefault();
  if (!hasLoadedOnce || isSaving) return;

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

  if (!await saveParticipant(participants[participantId])) {
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

function setActiveView(view) {
  const isCalendar = view === 'calendar';
  document.getElementById('calendarTab').classList.toggle('is-active', isCalendar);
  document.getElementById('calendarTab').setAttribute('aria-selected', String(isCalendar));
  document.getElementById('participantsTab').classList.toggle('is-active', !isCalendar);
  document.getElementById('participantsTab').setAttribute('aria-selected', String(!isCalendar));
  document.getElementById('calendarView').hidden = !isCalendar;
  document.getElementById('participantsView').hidden = isCalendar;
}

function startTableBackgroundSlideshow() {
  const firstLayer = tableBackgroundLayers[activeBackgroundLayer];
  firstLayer.addEventListener('load', () => firstLayer.classList.add('is-active'), { once: true });
  firstLayer.addEventListener('error', () => {
    console.error(`Não foi possível carregar a imagem de fundo: ${tableBackgroundImages[currentBackgroundIndex]}`);
  }, { once: true });
  firstLayer.src = tableBackgroundImages[currentBackgroundIndex];

  window.setInterval(() => {
    const nextIndex = (currentBackgroundIndex + 1) % tableBackgroundImages.length;
    const nextLayerIndex = 1 - activeBackgroundLayer;
    const nextLayer = tableBackgroundLayers[nextLayerIndex];

    nextLayer.onload = () => {
      nextLayer.onload = null;
      nextLayer.onerror = null;
      nextLayer.classList.add('is-active');
      tableBackgroundLayers[activeBackgroundLayer].classList.remove('is-active');
      activeBackgroundLayer = nextLayerIndex;
      currentBackgroundIndex = nextIndex;
    };
    nextLayer.onerror = () => {
      nextLayer.onload = null;
      nextLayer.onerror = null;
      console.error(`Não foi possível carregar a imagem de fundo: ${tableBackgroundImages[nextIndex]}`);
      currentBackgroundIndex = nextIndex;
    };
    nextLayer.src = tableBackgroundImages[nextIndex];
  }, TABLE_BACKGROUND_INTERVAL_MS);
}

document.getElementById('loginForm').addEventListener('submit', enterAsParticipant);
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
startTableBackgroundSlideshow();
loginButton.disabled = true;
showStatus('Conectando ao Supabase…');
loadParticipants().then(() => {
  window.setInterval(() => {
    if (!isSaving) loadParticipants({ quiet: true });
  }, REFRESH_INTERVAL_MS);
});