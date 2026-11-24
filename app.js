/* =========================================================
   OUT OF SCOPE (per SRS — intentionally NOT implemented):
   ❌ Online payment processing
   ❌ Database implementation (localStorage only)
   ❌ Academic advisor approval
   ❌ Online examination system
   ========================================================= */

/* =========================================================
   NFR 5: MAINTAINABILITY — Central config + version
   ========================================================= */
const CONFIG = Object.freeze({
  APP_VERSION: '1.0.0',
  DB_KEY: 'scrs_db_v1',
  SESSION_KEY: 'scrs_session',
  LAST_ID_KEY: 'scrs_last_id',
  AUTH_MSG_KEY: 'scrs_auth_msg',
  SESSION_TIMEOUT_MS: 15 * 60 * 1000,
  SESSION_CHECK_MS: 30 * 1000,
  PERFORMANCE_BUDGET_MS: 3000,
  DAYS: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']
});

const DAYS = CONFIG.DAYS;

/* NFR 2: start perf timer */
const _pageStartTime = performance.now();

let db = null;

/* =========================================================
   Utils
   ========================================================= */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const $ = sel => document.querySelector(sel);
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlaps = (a, b) => a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
const courseByCode = code => db.courses.find(c => c.code === code);
const sectionById = id => db.sections.find(s => s.id === id);
const currentStudent = () => db.students.find(s => s.id === getSession()?.id);
const enrolledCount = sid => db.registrations.filter(r => r.sectionId === sid).length;
const studentRegs = sid => db.registrations.filter(r => r.studentId === sid);
const studentCredits = sid => studentRegs(sid).reduce((sum, r) => sum + (courseByCode(r.courseCode)?.credits || 0), 0);

/* =========================================================
   Database layer
   ========================================================= */
function seed() {
  return {
    admins: [
      { username: 'admin', password: 'admin123' }
    ],
    students: [
      { id: '2021001', name: 'Sara Ahmed',  password: '1234', paid: true,  maxCredits: 18, completed: ['CS101'] },
      { id: '2021002', name: 'Omar Khaled', password: '1234', paid: false, maxCredits: 12, completed: [] },
      { id: '2021003', name: 'Mona Adel',   password: '1234', paid: true,  maxCredits: 18, completed: [] }
    ],
    courses: [
      { code: 'CS101', name: 'Introduction to Programming', credits: 3, prereq: null    },
      { code: 'CS201', name: 'Data Structures',             credits: 4, prereq: 'CS101' },
      { code: 'MA101', name: 'Calculus I',                  credits: 3, prereq: null    },
      { code: 'EN101', name: 'English Composition',         credits: 2, prereq: null    },
      { code: 'CS301', name: 'Database Systems',            credits: 3, prereq: 'CS201' }
    ],
    sections: [
      { id: 'SEC-1', courseCode: 'CS101', day: 'Monday',    start: '09:00', end: '10:30', room: 'A101', capacity: 30 },
      { id: 'SEC-2', courseCode: 'CS101', day: 'Tuesday',   start: '11:00', end: '12:30', room: 'A102', capacity: 1  },
      { id: 'SEC-3', courseCode: 'CS201', day: 'Tuesday',   start: '11:00', end: '12:30', room: 'B203', capacity: 25 },
      { id: 'SEC-4', courseCode: 'MA101', day: 'Sunday',    start: '08:00', end: '09:30', room: 'C105', capacity: 40 },
      { id: 'SEC-5', courseCode: 'EN101', day: 'Monday',    start: '11:00', end: '12:00', room: 'D110', capacity: 35 },
      { id: 'SEC-6', courseCode: 'CS301', day: 'Wednesday', start: '10:00', end: '11:30', room: 'B210', capacity: 20 }
    ],
    registrations: [
      { studentId: '2021003', courseCode: 'MA101', sectionId: 'SEC-4' },
      { studentId: '2021003', courseCode: 'CS101', sectionId: 'SEC-2' }
    ]
  };
}

function loadDB() {
  try { db = JSON.parse(localStorage.getItem(CONFIG.DB_KEY)); } catch (e) { db = null; }
  if (!db || !db.courses) { db = seed(); saveDB(); return; }

  // Migration: old db.admin → db.admins
  if (db.admin && !db.admins) {
    db.admins = [{ username: db.admin.username, password: db.admin.password }];
    delete db.admin;
    saveDB();
  }
  if (!Array.isArray(db.admins) || db.admins.length === 0) {
    db.admins = [{ username: 'admin', password: 'admin123' }];
    saveDB();
  }
}
function saveDB() { localStorage.setItem(CONFIG.DB_KEY, JSON.stringify(db)); }

/* =========================================================
   NFR 4: SECURITY — session with activity tracking
   ========================================================= */
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY)); }
  catch (e) { return null; }
}

function setSession(s) {
  sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({ ...s, lastActivity: Date.now() }));
}

function touchSession() {
  const raw = sessionStorage.getItem(CONFIG.SESSION_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    s.lastActivity = Date.now();
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(s));
  } catch (e) {}
}

function clearSession() { sessionStorage.removeItem(CONFIG.SESSION_KEY); }

function isSessionExpired() {
  const s = getSession();
  if (!s || !s.lastActivity) return false;
  return Date.now() - s.lastActivity > CONFIG.SESSION_TIMEOUT_MS;
}

function requireRole(role) {
  const s = getSession();
  if (!s) { window.location.replace('index.html'); return null; }

  if (isSessionExpired()) {
    clearSession();
    sessionStorage.setItem(CONFIG.AUTH_MSG_KEY, 'Your session expired. Please login again.');
    window.location.replace('index.html');
    return null;
  }

  if (s.role !== role) {
    window.location.replace(s.role === 'student' ? 'student-courses.html' : 'admin-courses.html');
    return null;
  }

  touchSession();
  return s;
}

function setupSessionGuards() {
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, touchSession, { passive: true });
  });

  setInterval(() => {
    if (isSessionExpired()) {
      clearSession();
      sessionStorage.setItem(CONFIG.AUTH_MSG_KEY, 'Your session expired due to inactivity.');
      window.location.replace('index.html');
    }
  }, CONFIG.SESSION_CHECK_MS);
}

/* =========================================================
   NFR 3: COMPATIBILITY
   ========================================================= */
function checkCompatibility() {
  const tests = {
    localStorage: () => { try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; } catch(e) { return false; } },
    sessionStorage: () => { try { sessionStorage.setItem('_t','1'); sessionStorage.removeItem('_t'); return true; } catch(e) { return false; } },
    querySelector: () => typeof document.querySelector === 'function',
    addEventListener: () => typeof window.addEventListener === 'function',
    JSON: () => typeof JSON !== 'undefined' && typeof JSON.parse === 'function',
    Promise: () => typeof Promise === 'function',
    performanceNow: () => typeof performance !== 'undefined' && typeof performance.now === 'function'
  };

  const missing = Object.entries(tests)
    .filter(([, fn]) => { try { return !fn(); } catch (e) { return true; } })
    .map(([name]) => name);

  if (missing.length) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                  background:#fee2e2;padding:20px;font-family:'Segoe UI',sans-serif">
        <div style="background:#fff;padding:32px;border-radius:16px;max-width:520px;text-align:center;
                    box-shadow:0 20px 45px rgba(0,0,0,.15)">
          <h1 style="color:#b91c1c;margin-bottom:12px">⚠️ Browser Not Supported</h1>
          <p style="color:#64748b;margin-bottom:16px">Your browser is missing required features:</p>
          <p style="background:#fef2f2;padding:12px;border-radius:8px;color:#b91c1c;font-weight:600;
                    word-break:break-word">${esc(missing.join(', '))}</p>
          <p style="color:#64748b;margin-top:16px;font-size:14px">
            Please use a modern browser such as
            <b>Google Chrome</b>, <b>Mozilla Firefox</b>, or <b>Microsoft Edge</b>.
          </p>
        </div>
      </div>`;
    return false;
  }
  return true;
}

/* =========================================================
   NFR 2 & 5: Footer + performance indicator
   ========================================================= */
function injectFooter() {
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `
    <span id="perfIndicator" aria-live="polite">Loading…</span>
    <span> • v${esc(CONFIG.APP_VERSION)} • Student Course Registration System</span>
  `;
  document.body.appendChild(footer);
}

function reportPerformance() {
  const elapsed = Math.round(performance.now() - _pageStartTime);
  const passed = elapsed < CONFIG.PERFORMANCE_BUDGET_MS;
  const indicator = document.getElementById('perfIndicator');
  if (indicator) {
    indicator.textContent = `Loaded in ${elapsed}ms ${passed ? '✓' : '⚠ (exceeds 3s budget)'}`;
    indicator.style.color = passed ? '#15803d' : '#b91c1c';
  }
  console.log(
    `%c[Performance] Page loaded in ${elapsed}ms — budget ${CONFIG.PERFORMANCE_BUDGET_MS}ms ${passed ? '✓ PASS' : '⚠ FAIL'}`,
    `color:${passed ? 'green' : 'red'};font-weight:bold;font-size:12px`
  );
}

/* =========================================================
   Toast
   ========================================================= */
let toastTimer = null;
function toast(msg, type = 'success') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

/* =========================================================
   Registration validation (Req 6,7,11,12,13)
   ========================================================= */
function validateRegistration(student, course, section) {
  if (!student.paid) return { ok: false, msg: '❌ Registration blocked: your tuition fees are unpaid.' };
  if (db.registrations.some(r => r.studentId === student.id && r.courseCode === course.code))
    return { ok: false, msg: '❌ You are already registered in this course.' };
  if (enrolledCount(section.id) >= section.capacity)
    return { ok: false, msg: '❌ This section is full. Please choose another section.' };
  if (course.prereq && !student.completed.includes(course.prereq))
    return { ok: false, msg: `❌ Prerequisite not met: you must complete ${course.prereq} first.` };
  if (studentCredits(student.id) + course.credits > student.maxCredits)
    return { ok: false, msg: `❌ Credit limit exceeded. Maximum allowed is ${student.maxCredits} credit hours.` };
  const mySections = studentRegs(student.id).map(r => sectionById(r.sectionId)).filter(Boolean);
  if (mySections.some(s => overlaps(s, section)))
    return { ok: false, msg: '❌ Schedule conflict with another registered section.' };
  return { ok: true, msg: '✅ Registration confirmed!' };
}

/* =========================================================
   Shell (top bar + logout) — Req 1/15
   ========================================================= */
function setupShell(role) {
  const who = $('#whoami');
  if (who) {
    const st = role === 'student' ? currentStudent() : null;
    who.textContent = st ? `${st.name} — ${st.id}` : 'Administrator';
  }
  const logout = $('#logoutBtn');
  if (logout) logout.onclick = () => {
    if (!confirm('Logout?')) return;
    clearSession();
    window.location.replace('index.html');
  };
}

/* =========================================================
   Sign In — Req 1/15
   ========================================================= */
function initLogin() {
  let role = 'student';

  document.querySelectorAll('.role-tab').forEach(btn => {
    btn.onclick = () => {
      role = btn.dataset.role;
      document.querySelectorAll('.role-tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#loginHint').textContent = role === 'student'
        ? 'Demo → 2021001 / 1234 (paid)  |  2021002 / 1234 (unpaid)'
        : 'Demo → admin / admin123';
    };
  });

  const s = getSession();
  if (s && !isSessionExpired()) {
    window.location.replace(s.role === 'student' ? 'student-courses.html' : 'admin-courses.html');
    return;
  }

  const authMsg = sessionStorage.getItem(CONFIG.AUTH_MSG_KEY);
  if (authMsg) {
    sessionStorage.removeItem(CONFIG.AUTH_MSG_KEY);
    setTimeout(() => toast('🔒 ' + authMsg, 'error'), 300);
  }

  const lastId = sessionStorage.getItem(CONFIG.LAST_ID_KEY);
  if (lastId) {
    $('#loginId').value = lastId;
    sessionStorage.removeItem(CONFIG.LAST_ID_KEY);
    $('#loginPass').focus();
  }

  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    const id = $('#loginId').value.trim();
    const pass = $('#loginPass').value;

    if (role === 'student') {
      const st = db.students.find(x => x.id === id && x.password === pass);
      if (!st) return toast('❌ Invalid student ID or password.', 'error');
      setSession({ role: 'student', id: st.id });
      window.location.replace('student-courses.html');
    } else {
      const admin = db.admins.find(a => a.username === id && a.password === pass);
      if (!admin) return toast('❌ Invalid administrator credentials.', 'error');
      setSession({ role: 'admin', id: admin.username });
      window.location.replace('admin-courses.html');
    }
  };
}

/* =========================================================
   Sign Up
   ========================================================= */
function initRegister() {
  const s = getSession();
  if (s && !isSessionExpired()) {
    window.location.replace(s.role === 'student' ? 'student-courses.html' : 'admin-courses.html');
    return;
  }

  $('#registerForm').onsubmit = e => {
    e.preventDefault();
    const id    = $('#regId').value.trim();
    const name  = $('#regName').value.trim();
    const pass  = $('#regPass').value;
    const pass2 = $('#regPass2').value;

    if (!/^\d{5,10}$/.test(id)) return toast('❌ Student ID must be 5–10 digits.', 'error');
    if (db.students.some(s => s.id === id)) return toast('❌ This Student ID is already registered.', 'error');
    if (name.length < 3) return toast('❌ Please enter your full name.', 'error');
    if (pass.length < 4) return toast('❌ Password must be at least 4 characters.', 'error');
    if (pass !== pass2) return toast('❌ Passwords do not match.', 'error');

    db.students.push({ id, name, password: pass, paid: false, maxCredits: 18, completed: [] });
    saveDB();

    toast('✅ Account created! Redirecting to sign in…', 'success');
    setTimeout(() => {
      sessionStorage.setItem(CONFIG.LAST_ID_KEY, id);
      window.location.replace('index.html');
    }, 1400);
  };
}

/* =========================================================
   Student — Browse Courses (Req 2,3,4,5,14)
   ========================================================= */
function initStudentCourses() {
  setupShell('student');
  let search = '';

  const render = () => {
    const q = search.trim().toLowerCase();
    const list = db.courses.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));

    if (!list.length) {
      $('#courseList').innerHTML = '<div class="empty">No courses match your search.</div>';
      return;
    }

    $('#courseList').innerHTML = list.map(c => {
      const sections = db.sections.filter(s => s.courseCode === c.code);
      const rows = sections.map(s => {
        const taken = enrolledCount(s.id);
        const full = taken >= s.capacity;
        return `<tr>
          <td><b>${esc(s.id)}</b></td>
          <td>${esc(s.day)}</td>
          <td>${esc(s.start)} – ${esc(s.end)}</td>
          <td>${esc(s.room)}</td>
          <td>${taken} / ${s.capacity} ${full ? '<span class="badge danger">Full</span>' : '<span class="badge ok">Available</span>'}</td>
          <td><button class="btn small primary" data-register="${esc(s.id)}">Register</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">No sections yet.</td></tr>';

      return `<div class="card">
        <div class="card-head"><div>
          <h3>${esc(c.code)} — ${esc(c.name)}</h3>
          <div class="muted small">${c.credits} credits • Prerequisite: <b>${esc(c.prereq || 'None')}</b></div>
        </div></div>
        <table class="table">
          <thead><tr><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Seats</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    document.querySelectorAll('[data-register]').forEach(b => {
      b.onclick = () => registerSection(b.dataset.register);
    });
  };

  const registerSection = sid => {
    const section = sectionById(sid);
    const course = courseByCode(section.courseCode);
    const student = currentStudent();
    if (!student) return;

    const result = validateRegistration(student, course, section);
    if (!result.ok) return toast(result.msg, 'error');

    const ok = confirm(
      `Confirm Registration?\n\n` +
      `Course:  ${course.code} — ${course.name}\n` +
      `Section: ${section.id}\n` +
      `Day:     ${section.day}\n` +
      `Time:    ${section.start} – ${section.end}\n` +
      `Room:    ${section.room}\n` +
      `Credits: ${course.credits}`
    );
    if (!ok) return;

    db.registrations.push({ studentId: student.id, courseCode: course.code, sectionId: section.id });
    saveDB();

    alert(
      `✅ Registration Confirmed!\n\n` +
      `You have been registered in:\n` +
      `${course.code} — ${course.name}\n` +
      `Section ${section.id} • ${section.day} ${section.start}–${section.end} • Room ${section.room}\n\n` +
      `Total registered credits: ${studentCredits(student.id)} / ${student.maxCredits}`
    );
    toast(`✅ Registered in ${course.code} (${section.id})`, 'success');

    render();
  };

  $('#searchInput').oninput = e => { search = e.target.value; render(); };
  render();
}

/* =========================================================
   Student — My Courses (Req 8,9)
   ========================================================= */
function initStudentMyCourses() {
  setupShell('student');
  const st = currentStudent();
  if (!st) return;

  $('#myCredits').textContent = `${studentCredits(st.id)} / ${st.maxCredits}`;

  const regs = studentRegs(st.id);
  $('#myCoursesBody').innerHTML = regs.map(r => {
    const c = courseByCode(r.courseCode);
    const s = sectionById(r.sectionId);
    if (!c || !s) return '';
    return `<tr>
      <td><b>${esc(c.code)}</b></td>
      <td>${esc(c.name)}</td>
      <td>${c.credits}</td>
      <td>${esc(s.day)} ${esc(s.start)} – ${esc(s.end)}</td>
      <td>${esc(s.room)}</td>
      <td><button class="btn small danger" data-drop="${esc(c.code)}">Drop</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">No registered courses yet.</td></tr>';

  document.querySelectorAll('[data-drop]').forEach(b => {
    b.onclick = () => {
      if (!confirm(`Drop ${b.dataset.drop}?`)) return;
      db.registrations = db.registrations.filter(
        r => !(r.studentId === st.id && r.courseCode === b.dataset.drop)
      );
      saveDB();
      toast('✅ Course dropped.', 'success');
      initStudentMyCourses();
    };
  });
}

/* =========================================================
   Student — Weekly Schedule (Req 9)
   ========================================================= */
function initStudentSchedule() {
  setupShell('student');
  const s = getSession();
  const regs = studentRegs(s.id).map(r => sectionById(r.sectionId)).filter(Boolean);

  if (!regs.length) {
    $('#scheduleGrid').innerHTML = '<div class="empty">No registered courses in your schedule.</div>';
    return;
  }

  $('#scheduleGrid').innerHTML = DAYS.map(day => {
    const items = regs
      .filter(x => x.day === day)
      .sort((a, b) => toMin(a.start) - toMin(b.start))
      .map(x => {
        const c = courseByCode(x.courseCode);
        return `<div class="slot">
          <b>${esc(c ? c.code : '')}</b>
          <span>${esc(x.start)} – ${esc(x.end)}</span>
          <span class="muted">Room ${esc(x.room)}</span>
        </div>`;
      }).join('');
    return `<div class="day-col"><h4>${esc(day)}</h4>${items || '<p class="muted small">No classes</p>'}</div>`;
  }).join('');
}

/* =========================================================
   Student — Tuition (Req 10)
   ========================================================= */
function initStudentTuition() {
  setupShell('student');
  const st = currentStudent();
  if (!st) return;
  $('#tuitionContent').innerHTML = `
    <div class="status ${st.paid ? 'ok' : 'bad'}">
      <span class="dot"></span>
      ${st.paid ? 'PAID — you may register for courses.' : 'UNPAID — registration is blocked.'}
    </div>
    <p class="muted small" style="margin-top:14px">
      Student: <b>${esc(st.name)}</b> (${esc(st.id)}) • Max credits: <b>${st.maxCredits}</b>
    </p>`;
}

/* =========================================================
   Admin — Courses (Req 16, 22)
   ========================================================= */
let editingCourseCode = null;

function initAdminCourses() {
  setupShell('admin');

  const renderTable = () => {
    $('#courseRows').innerHTML = db.courses.map(c => `<tr>
      <td><b>${esc(c.code)}</b></td>
      <td>${esc(c.name)}</td>
      <td>${c.credits}</td>
      <td>${esc(c.prereq || '—')}</td>
      <td>${db.sections.filter(s => s.courseCode === c.code).length}</td>
      <td>
        <button class="btn small" data-edit="${esc(c.code)}">Edit</button>
        <button class="btn small danger" data-del="${esc(c.code)}">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">No courses.</td></tr>';

    document.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => {
        editingCourseCode = b.dataset.edit;
        const c = courseByCode(editingCourseCode);
        $('#cCode').value = c.code;
        $('#cCode').readOnly = true;
        $('#cName').value = c.name;
        $('#cCredits').value = c.credits;
        $('#cPrereq').value = c.prereq || '';
        $('#courseFormTitle').textContent = 'Edit Course: ' + c.code;
        $('#courseSubmitBtn').textContent = 'Update Course';
        $('#cancelEditBtn').classList.remove('hidden');
      };
    });

    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if (!confirm(`Delete course ${b.dataset.del}?`)) return;
        db.courses = db.courses.filter(c => c.code !== b.dataset.del);
        db.sections = db.sections.filter(s => s.courseCode !== b.dataset.del);
        db.registrations = db.registrations.filter(r => r.courseCode !== b.dataset.del);
        saveDB();
        toast('✅ Course deleted.', 'success');
        renderTable();
        renderPrereqOptions();
      };
    });
  };

  const renderPrereqOptions = () => {
    const current = $('#cPrereq').value;
    $('#cPrereq').innerHTML = '<option value="">None</option>' + db.courses
      .filter(c => c.code !== editingCourseCode)
      .map(c => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`)
      .join('');
    if (current) $('#cPrereq').value = current;
  };

  $('#courseForm').onsubmit = e => {
    e.preventDefault();
    const name = $('#cName').value.trim();
    const credits = Number($('#cCredits').value);
    const prereq = $('#cPrereq').value || null;

    if (editingCourseCode) {
      const c = courseByCode(editingCourseCode);
      c.name = name; c.credits = credits; c.prereq = prereq;
      editingCourseCode = null;
      $('#cCode').readOnly = false;
      $('#courseFormTitle').textContent = 'Add New Course';
      $('#courseSubmitBtn').textContent = 'Add Course';
      $('#cancelEditBtn').classList.add('hidden');
      saveDB();
      toast('✅ Course updated.', 'success');
    } else {
      const code = $('#cCode').value.trim().toUpperCase();
      if (!code) return toast('❌ Course code required.', 'error');
      if (courseByCode(code)) return toast('❌ Course code already exists.', 'error');
      db.courses.push({ code, name, credits, prereq });
      saveDB();
      toast('✅ Course added.', 'success');
    }

    e.target.reset();
    renderTable();
    renderPrereqOptions();
  };

  $('#cancelEditBtn').onclick = () => {
    editingCourseCode = null;
    $('#courseForm').reset();
    $('#cCode').readOnly = false;
    $('#courseFormTitle').textContent = 'Add New Course';
    $('#courseSubmitBtn').textContent = 'Add Course';
    $('#cancelEditBtn').classList.add('hidden');
  };

  renderPrereqOptions();
  renderTable();
}

/* =========================================================
   Admin — Sections (Req 18, 19)
   ========================================================= */
function initAdminSections() {
  setupShell('admin');
  let editingSectionId = null;

  const populateCourses = () => {
    $('#sCourse').innerHTML = db.courses.map(c =>
      `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join('') ||
      '<option value="">No courses</option>';
  };

  const resetForm = () => {
    editingSectionId = null;
    $('#sectionForm').reset();
    $('#sectionSubmitBtn').textContent = 'Add Section';
    $('#cancelSectionEdit').classList.add('hidden');
  };

  const renderTable = () => {
    $('#sectionRows').innerHTML = db.sections.map(s => {
      const c = courseByCode(s.courseCode);
      const taken = enrolledCount(s.id);
      return `<tr>
        <td><b>${esc(s.id)}</b></td>
        <td>${esc(s.courseCode)} — ${esc(c ? c.name : '')}</td>
        <td>${esc(s.day)}</td>
        <td>${esc(s.start)} – ${esc(s.end)}</td>
        <td>${esc(s.room)}</td>
        <td>${taken} / ${s.capacity}</td>
        <td>
          <input class="mini-input" type="number" min="1" value="${s.capacity}" data-capacity="${esc(s.id)}">
          <button class="btn small" data-save-cap="${esc(s.id)}">Save</button>
        </td>
        <td>
          <button class="btn small" data-edit="${esc(s.id)}">Edit</button>
          <button class="btn small danger" data-del="${esc(s.id)}">Delete</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">No sections.</td></tr>';

    document.querySelectorAll('[data-save-cap]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.saveCap;
        const val = Number(document.querySelector(`[data-capacity="${id}"]`).value);
        if (!val || val < 1) return toast('❌ Capacity must be ≥ 1.', 'error');
        if (val < enrolledCount(id)) return toast('❌ Capacity < enrolled students.', 'error');
        sectionById(id).capacity = val;
        saveDB();
        toast('✅ Capacity updated.', 'success');
        renderTable();
      };
    });

    document.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => {
        const s = sectionById(b.dataset.edit);
        editingSectionId = s.id;
        $('#sCourse').value = s.courseCode;
        $('#sDay').value = s.day;
        $('#sStart').value = s.start;
        $('#sEnd').value = s.end;
        $('#sRoom').value = s.room;
        $('#sCap').value = s.capacity;
        $('#sectionSubmitBtn').textContent = 'Update Section';
        $('#cancelSectionEdit').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });

    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if (!confirm(`Delete section ${b.dataset.del}?`)) return;
        db.sections = db.sections.filter(s => s.id !== b.dataset.del);
        db.registrations = db.registrations.filter(r => r.sectionId !== b.dataset.del);
        saveDB();
        toast('✅ Section deleted.', 'success');
        renderTable();
      };
    });
  };

  $('#sectionForm').onsubmit = e => {
    e.preventDefault();
    const courseCode = $('#sCourse').value;
    const day = $('#sDay').value;
    const start = $('#sStart').value;
    const end = $('#sEnd').value;
    const room = $('#sRoom').value.trim();
    const capacity = Number($('#sCap').value);

    if (!courseCode) return toast('❌ Add a course first.', 'error');
    if (toMin(end) <= toMin(start)) return toast('❌ End must be after start.', 'error');
    if (capacity < 1) return toast('❌ Capacity must be ≥ 1.', 'error');

    if (editingSectionId) {
      if (capacity < enrolledCount(editingSectionId))
        return toast('❌ Capacity < enrolled students.', 'error');
      const s = sectionById(editingSectionId);
      Object.assign(s, { courseCode, day, start, end, room, capacity });
      saveDB();
      toast(`✅ Section ${editingSectionId} updated.`, 'success');
      resetForm();
    } else {
      const nums = db.sections.map(x => Number(x.id.split('-')[1]) || 0);
      const id = 'SEC-' + (Math.max(0, ...nums) + 1);
      db.sections.push({ id, courseCode, day, start, end, room, capacity });
      saveDB();
      toast(`✅ Section ${id} added.`, 'success');
      e.target.reset();
    }
    renderTable();
  };

  $('#cancelSectionEdit').onclick = resetForm;
  populateCourses();
  renderTable();
}

/* =========================================================
   Admin — Students (Req 17, 21, 22)
   ========================================================= */
function initAdminStudents() {
  setupShell('admin');

  const renderTable = () => {
    $('#studentRows').innerHTML = db.students.map(st => `<tr>
      <td><b>${esc(st.id)}</b></td>
      <td>${esc(st.name)}</td>
      <td>${st.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge danger">Unpaid</span>'}</td>
      <td>
        <input class="mini-input" type="number" min="1" value="${st.maxCredits}" data-max="${esc(st.id)}">
        <button class="btn small" data-save-max="${esc(st.id)}">Save</button>
      </td>
      <td>${studentCredits(st.id)} / ${st.maxCredits}</td>
      <td>${studentRegs(st.id).length}</td>
      <td>
        <button class="btn small" data-toggle="${esc(st.id)}">${st.paid ? 'Set Unpaid' : 'Set Paid'}</button>
        <button class="btn small danger" data-del="${esc(st.id)}">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No students.</td></tr>';

    document.querySelectorAll('[data-toggle]').forEach(b => {
      b.onclick = () => {
        const st = db.students.find(s => s.id === b.dataset.toggle);
        st.paid = !st.paid;
        saveDB();
        toast(`✅ ${st.name}: ${st.paid ? 'PAID' : 'UNPAID'}`, 'success');
        renderTable();
      };
    });

    document.querySelectorAll('[data-save-max]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.saveMax;
        const val = Number(document.querySelector(`[data-max="${id}"]`).value);
        if (!val || val < 1) return toast('❌ Must be ≥ 1.', 'error');
        if (val < studentCredits(id)) return toast('❌ Less than current credits.', 'error');
        db.students.find(s => s.id === id).maxCredits = val;
        saveDB();
        toast('✅ Max credits updated.', 'success');
        renderTable();
      };
    });

    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const st = db.students.find(s => s.id === b.dataset.del);
        if (!confirm(`Delete ${st.name} (${st.id})?`)) return;
        db.students = db.students.filter(s => s.id !== b.dataset.del);
        db.registrations = db.registrations.filter(r => r.studentId !== b.dataset.del);
        saveDB();
        toast('✅ Student deleted.', 'success');
        renderTable();
      };
    });
  };

  $('#studentForm').onsubmit = e => {
    e.preventDefault();
    const id = $('#stId').value.trim();
    const name = $('#stName').value.trim();
    const pass = $('#stPass').value.trim();
    const max = Number($('#stMax').value);

    if (!id || !name || !pass) return toast('❌ Fill all fields.', 'error');
    if (db.students.some(s => s.id === id)) return toast('❌ ID already exists.', 'error');
    if (max < 1) return toast('❌ Max credits must be ≥ 1.', 'error');

    db.students.push({ id, name, password: pass, paid: false, maxCredits: max, completed: [] });
    saveDB();
    toast('✅ Student added.', 'success');
    e.target.reset();
    renderTable();
  };

  renderTable();
}

/* =========================================================
   Admin — Registrations (Req 20)
   ========================================================= */
function initAdminRegs() {
  setupShell('admin');

  $('#regRows').innerHTML = db.registrations.map((r, i) => {
    const st = db.students.find(s => s.id === r.studentId);
    const c = courseByCode(r.courseCode);
    const s = sectionById(r.sectionId);
    return `<tr>
      <td><b>${esc(r.studentId)}</b></td>
      <td>${esc(st ? st.name : '—')}</td>
      <td>${esc(r.courseCode)}</td>
      <td>${esc(c ? c.name : '—')}</td>
      <td>${esc(r.sectionId)}</td>
      <td>${s ? `${esc(s.day)} ${esc(s.start)} – ${esc(s.end)}` : '—'}</td>
      <td>${esc(s ? s.room : '—')}</td>
      <td>${st ? (st.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge danger">Unpaid</span>') : ''}</td>
      <td><button class="btn small danger" data-del-reg="${i}">Remove</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="muted">No registrations.</td></tr>';

  document.querySelectorAll('[data-del-reg]').forEach(b => {
    b.onclick = () => {
      if (!confirm('Remove this registration?')) return;
      db.registrations.splice(Number(b.dataset.delReg), 1);
      saveDB();
      toast('✅ Registration removed.', 'success');
      initAdminRegs();
    };
  });
}

/* =========================================================
   Admin — Manage Admins (NEW)
   ========================================================= */
function initAdminManagement() {
  setupShell('admin');
  const self = getSession().id;

  const renderTable = () => {
    $('#adminRows').innerHTML = db.admins.map(a => `
      <tr>
        <td>
          <b>${esc(a.username)}</b>
          ${a.username === self ? ' <span class="badge ok">You</span>' : ''}
        </td>
        <td class="muted">${'•'.repeat(Math.max(4, a.password.length))}</td>
        <td>
          ${a.username === self
            ? '<span class="muted small">Current session</span>'
            : `<button class="btn small danger" data-del="${esc(a.username)}">Delete</button>`}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="muted">No administrators.</td></tr>';

    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const username = b.dataset.del;
        if (db.admins.length <= 1)
          return toast('❌ Cannot delete the last administrator.', 'error');
        if (!confirm(`Delete administrator "${username}"?`)) return;
        db.admins = db.admins.filter(a => a.username !== username);
        saveDB();
        toast(`✅ Administrator "${username}" deleted.`, 'success');
        renderTable();
      };
    });
  };

  $('#adminForm').onsubmit = e => {
    e.preventDefault();
    const username = $('#aUser').value.trim();
    const password = $('#aPass').value;
    const confirmPw = $('#aPass2').value;

    if (username.length < 3)
      return toast('❌ Username must be at least 3 characters.', 'error');
    if (password.length < 4)
      return toast('❌ Password must be at least 4 characters.', 'error');
    if (password !== confirmPw)
      return toast('❌ Passwords do not match.', 'error');
    if (db.admins.some(a => a.username === username))
      return toast('❌ This username already exists.', 'error');

    db.admins.push({ username, password });
    saveDB();
    toast(`✅ Administrator "${username}" added.`, 'success');
    e.target.reset();
    renderTable();
  };

  renderTable();
}

/* =========================================================
   Router
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  if (!checkCompatibility()) return;

  injectFooter();
  setupSessionGuards();

  loadDB();
  const page = document.body.dataset.page;

  if (page === 'login') return initLogin();
  if (page === 'register') return initRegister();

  const role = page.startsWith('student') ? 'student' : 'admin';
  const s = requireRole(role);
  if (!s) return;

  if (page === 'student-courses') initStudentCourses();
  else if (page === 'student-my-courses') initStudentMyCourses();
  else if (page === 'student-schedule') initStudentSchedule();
  else if (page === 'student-tuition') initStudentTuition();
  else if (page === 'admin-courses') initAdminCourses();
  else if (page === 'admin-sections') initAdminSections();
  else if (page === 'admin-students') initAdminStudents();
  else if (page === 'admin-registrations') initAdminRegs();
  else if (page === 'admin-management') initAdminManagement();
});

window.addEventListener('load', reportPerformance);