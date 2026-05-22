const DATA_URL = "data/calendar_features_2023-01-01_2026-12-31.csv";

const monthNames = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const detailDateFormat = new Intl.DateTimeFormat("en", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const state = {
  rows: [],
  byDate: new Map(),
  currentMonth: new Date(2025, 9, 1),
  selectedDate: "2025-10-13",
  filters: {
    publicHolidays: true,
    schoolHolidays: true,
    termEvents: true,
  },
};

const elements = {
  calendarGrid: document.querySelector("#calendarGrid"),
  currentMonth: document.querySelector("#currentMonth"),
  monthIntensity: document.querySelector("#monthIntensity"),
  monthPublicHolidays: document.querySelector("#monthPublicHolidays"),
  monthPeakDate: document.querySelector("#monthPeakDate"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  monthSelect: document.querySelector("#monthSelect"),
  showPublicHolidays: document.querySelector("#showPublicHolidays"),
  showSchoolHolidays: document.querySelector("#showSchoolHolidays"),
  showTermEvents: document.querySelector("#showTermEvents"),
  detailsDate: document.querySelector("#detailsDate"),
  detailsTags: document.querySelector("#detailsTags"),
  detailsList: document.querySelector("#detailsList"),
};

function parseCsv(text) {
  if (typeof text !== "string") {
    throw new Error("Calendar data was not loaded as CSV text.");
  }

  const rows = [];
  let field = "";
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

function toBool(value) {
  return value === "True" || value === "true";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row) {
  return {
    ...row,
    working_day: toBool(row.working_day),
    is_weekend: toBool(row.is_weekend),
    is_public_holiday: toBool(row.is_public_holiday),
    is_school_holiday_anywhere: toBool(row.is_school_holiday_anywhere),
    school_holiday_municipality_count: toNumber(row.school_holiday_municipality_count),
    school_holiday_population: toNumber(row.school_holiday_population),
    school_holiday_population_weight: toNumber(row.school_holiday_population_weight),
    autumn_break_municipality_count: toNumber(row.autumn_break_municipality_count),
    christmas_break_municipality_count: toNumber(row.christmas_break_municipality_count),
    winter_break_municipality_count: toNumber(row.winter_break_municipality_count),
  };
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthDates(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function intensityClass(row) {
  if (!row || !state.filters.schoolHolidays || !row.is_school_holiday_anywhere) {
    return "";
  }

  if (row.school_holiday_population_weight >= 0.45) {
    return "intensity-high";
  }

  if (row.school_holiday_population_weight >= 0.2) {
    return "intensity-mid";
  }

  return "intensity-low";
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function niceList(value) {
  return value ? value.split(";").join(", ") : "-";
}

function dayLabels(row) {
  if (!row) {
    return "";
  }

  const labels = [];

  if (state.filters.publicHolidays && row.is_public_holiday) {
    labels.push(`<span class="pill public">${row.holiday_description}</span>`);
  }

  if (state.filters.schoolHolidays && row.is_school_holiday_anywhere) {
    labels.push(
      `<span class="pill school">${row.school_holiday_municipality_count} cities / ${percent(row.school_holiday_population_weight)}</span>`,
    );
  }

  if (state.filters.termEvents && row.school_start_municipalities) {
    labels.push(`<span class="pill event">School starts</span>`);
  }

  if (state.filters.termEvents && row.school_end_municipalities) {
    labels.push(`<span class="pill event">School ends</span>`);
  }

  return labels.join("");
}

function updateSummary() {
  const rows = state.rows.filter((row) => {
    const rowDate = new Date(`${row.date}T00:00:00`);
    return (
      rowDate.getFullYear() === state.currentMonth.getFullYear() &&
      rowDate.getMonth() === state.currentMonth.getMonth()
    );
  });
  const intensity = rows.reduce(
    (total, row) => total + row.school_holiday_population_weight,
    0,
  );
  const publicHolidays = rows.filter((row) => row.is_public_holiday).length;
  const peak = rows.reduce((best, row) => {
    if (!best || row.school_holiday_population_weight > best.school_holiday_population_weight) {
      return row;
    }
    return best;
  }, null);

  elements.monthIntensity.textContent = percent(intensity / Math.max(rows.length, 1));
  elements.monthPublicHolidays.textContent = String(publicHolidays);
  elements.monthPeakDate.textContent =
    peak && peak.school_holiday_population_weight > 0
      ? `${peak.date.slice(5)} / ${percent(peak.school_holiday_population_weight)}`
      : "-";
}

function monthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function populateMonthSelect() {
  const months = [...new Set(state.rows.map((row) => row.date.slice(0, 7)))];
  elements.monthSelect.innerHTML = months
    .map((month) => {
      const [year, monthNumber] = month.split("-");
      const label = monthNames.format(new Date(Number(year), Number(monthNumber) - 1, 1));
      return `<option value="${month}">${label}</option>`;
    })
    .join("");
}

function renderCalendar() {
  elements.currentMonth.textContent = monthNames.format(state.currentMonth);
  elements.calendarGrid.innerHTML = "";

  for (const day of monthDates(state.currentMonth)) {
    const key = dateKey(day);
    const row = state.byDate.get(key);
    const button = document.createElement("button");
    const classes = ["day", intensityClass(row)];

    if (day.getMonth() !== state.currentMonth.getMonth()) {
      classes.push("outside");
    }
    if (row?.is_weekend) {
      classes.push("weekend");
    }
    if (state.filters.publicHolidays && row?.is_public_holiday) {
      classes.push("public-holiday");
    }
    if (key === state.selectedDate) {
      classes.push("selected");
    }

    button.className = classes.filter(Boolean).join(" ");
    button.type = "button";
    button.dataset.date = key;
    button.innerHTML = `
      <div class="day-number">
        <span>${day.getDate()}</span>
        ${row?.school_holiday_population_weight ? `<span class="weight">${percent(row.school_holiday_population_weight)}</span>` : ""}
      </div>
      <div class="day-labels">${dayLabels(row)}</div>
    `;
    button.addEventListener("click", () => {
      state.selectedDate = key;
      render();
    });
    elements.calendarGrid.append(button);
  }
}

function addDetail(label, value) {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  elements.detailsList.append(term, detail);
}

function renderDetails() {
  const row = state.byDate.get(state.selectedDate);
  elements.detailsTags.innerHTML = "";
  elements.detailsList.innerHTML = "";

  if (!row) {
    elements.detailsDate.textContent = state.selectedDate;
    addDetail("Status", "No feature row in the loaded dataset.");
    return;
  }

  elements.detailsDate.textContent = detailDateFormat.format(
    new Date(`${row.date}T00:00:00`),
  );

  if (row.is_public_holiday) {
    elements.detailsTags.insertAdjacentHTML(
      "beforeend",
      `<span class="pill public">${row.holiday_description}</span>`,
    );
  }
  if (row.is_school_holiday_anywhere) {
    elements.detailsTags.insertAdjacentHTML(
      "beforeend",
      `<span class="pill school">School holiday</span>`,
    );
  }
  if (row.school_start_municipalities || row.school_end_municipalities) {
    elements.detailsTags.insertAdjacentHTML(
      "beforeend",
      `<span class="pill event">Term event</span>`,
    );
  }

  addDetail("Working day", row.working_day ? "Yes" : "No");
  addDetail("School holiday population weight", percent(row.school_holiday_population_weight));
  addDetail("School holiday population", row.school_holiday_population.toLocaleString("en"));
  addDetail("Municipalities on holiday", niceList(row.school_holiday_municipalities));
  addDetail("Break type", niceList(row.school_holiday_types));
  addDetail("School starts", niceList(row.school_start_municipalities));
  addDetail("School ends", niceList(row.school_end_municipalities));
}

function render() {
  elements.monthSelect.value = monthKey(state.currentMonth);
  updateSummary();
  renderCalendar();
  renderDetails();
}

function wireControls() {
  elements.previousMonth.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() - 1,
      1,
    );
    render();
  });

  elements.nextMonth.addEventListener("click", () => {
    state.currentMonth = new Date(
      state.currentMonth.getFullYear(),
      state.currentMonth.getMonth() + 1,
      1,
    );
    render();
  });

  elements.monthSelect.addEventListener("change", (event) => {
    const [year, month] = event.target.value.split("-").map(Number);
    state.currentMonth = new Date(year, month - 1, 1);
    state.selectedDate = `${event.target.value}-01`;
    render();
  });

  elements.showPublicHolidays.addEventListener("change", (event) => {
    state.filters.publicHolidays = event.target.checked;
    render();
  });

  elements.showSchoolHolidays.addEventListener("change", (event) => {
    state.filters.schoolHolidays = event.target.checked;
    render();
  });

  elements.showTermEvents.addEventListener("change", (event) => {
    state.filters.termEvents = event.target.checked;
    render();
  });
}

async function init() {
  wireControls();
  let csvText =
    typeof window.CALENDAR_FEATURES_CSV === "string"
      ? window.CALENDAR_FEATURES_CSV
      : window.CALENDAR_FEATURES_CSV?.value;

  if (!csvText) {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to load ${DATA_URL}`);
    }
    csvText = await response.text();
  }

  state.rows = parseCsv(csvText).map(normalizeRow);
  state.byDate = new Map(state.rows.map((row) => [row.date, row]));
  populateMonthSelect();
  render();
}

init().catch((error) => {
  elements.calendarGrid.innerHTML = `<p class="load-error">${error.message}</p>`;
});
