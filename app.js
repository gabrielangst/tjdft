/* app.js - Versão modificada: filtro de data mostra SOMENTE provas; pesquisa por nome separada com dropdown.
   Base original do usuário preservada; apenas ajustes nas áreas de manager (filtros) e funções auxiliares adicionadas.
*/

const STORAGE_KEY = 'sistema_provas_multi_v5';

// ----------------- Helpers -----------------
function uuid(){ return 'id-' + Math.random().toString(36).slice(2,9); }
function nowISO(){ return new Date().toISOString().slice(0,10); }
function timestamp(){ return new Date().toISOString(); }
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function downloadBlob(txt, filename){ const blob = new Blob([txt], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

// ----------------- Storage / Sample -----------------
function defaultPowersFor(role){
  if(role === 'super') return { create_intern:true, edit_user:true, delete_user:true, reset_password:true, delegate_admins:true, manage_hours:true };
  if(role === 'admin') return { create_intern:true, edit_user:true, delete_user:true, reset_password:true, delegate_admins:false, manage_hours:true };
  return { manage_hours:false };
}

function sampleData(){
  const interns = [];
  for(let i=1;i<=10;i++){
    interns.push({ id: 'intern-'+i, name: `Estagiário ${i}`, dates: [], hoursEntries: [], auditLog: [] });
  }
  const users = [];
  users.push({ id: uuid(), username: 'admin', password: 'admin123', role: 'super', powers: defaultPowersFor('super'), selfPasswordChange: true });
  interns.forEach((it, idx)=>{
    users.push({ id: uuid(), username: 'est'+(idx+1), password: 'senha123', role: 'intern', internId: it.id, powers: defaultPowersFor('intern'), selfPasswordChange: true });
  });
  return { users, interns, meta: { created: new Date().toISOString(), provaBlockDays: 0 } };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return sampleData();
    const parsed = JSON.parse(raw);
    parsed.meta = parsed.meta || {};
    if(typeof parsed.meta.provaBlockDays === 'undefined') parsed.meta.provaBlockDays = 0;
    parsed.interns = parsed.interns.map(i=> Object.assign({ hoursEntries:[], auditLog:[] }, i));
    return parsed;
  }catch(e){
    console.error(e);
    return sampleData();
  }
}

function save(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ----------------- App State -----------------
let state = load();
const root = document.getElementById('root');
let session = null; // { userId }

// Utilities
function findUserByIntern(internId){ return state.users.find(u=>u.internId===internId); }
function findInternById(id){ return state.interns.find(i=>i.id===id); }
function hasPower(user, power){ if(!user) return false; if(user.role==='super') return true; return !!(user.powers && user.powers[power]); }

// ----------------- Modal helper -----------------
function showModal(innerHtml, options={}){
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div'); modal.className = 'modal';
  modal.innerHTML = innerHtml;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  function close(){ if(backdrop.parentNode) backdrop.remove(); if(options.onClose) options.onClose(); }
  const onKey = (e)=>{ if(e.key==='Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (ev)=>{ if(ev.target === backdrop && options.allowBackdropClose !== false) close(); });
  return { backdrop, modal, close, cleanup: ()=>{ document.removeEventListener('keydown', onKey); } };
}

// ----------------- Render router -----------------
function render(){ if(!session) return renderLogin(); const user = state.users.find(u=>u.id===session.userId); if(!user){ session=null; return renderLogin(); } if(user.role==='intern') return renderIntern(user); return renderManager(user); }

// ----------------- LOGIN -----------------
function renderLogin(){
  root.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `
    <h2>Entrar</h2>
    <div class="muted small">Usuário: <strong>admin</strong> / senha: <strong>admin123</strong></div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-width:480px">
      <input id="inpUser" placeholder="Usuário" />
      <input id="inpPass" placeholder="Senha" type="password" />
      <div style="display:flex;gap:8px">
        <button class="button" id="btnLogin">Entrar</button>
        <button class="button ghost" id="btnSamples">Criar/Resetar amostra</button>
      </div>
      <div class="muted small">Exemplos: est1..est10 / senha: senha123</div>
    </div>
  `;
  root.appendChild(card);

  document.getElementById('btnLogin').addEventListener('click', ()=>{
    const u = document.getElementById('inpUser').value.trim();
    const p = document.getElementById('inpPass').value;
    const user = state.users.find(x=>x.username === u && x.password === p);
    if(!user) return alert('Usuário ou senha inválidos');
    session = { userId: user.id };
    render();
  });

  document.getElementById('btnSamples').addEventListener('click', ()=>{ if(confirm('Criar/Resetar dados de exemplo?')){ state = sampleData(); save(state); alert('Dados criados'); render(); }});
}

// ----------------- INTERN VIEW -----------------
function calcHoursSummary(intern){
  const arr = intern.hoursEntries || [];
  const bank = arr.filter(e=>e.hours>0).reduce((s,e)=>s+e.hours,0);
  const neg = arr.filter(e=>e.hours<0 && !e.compensated).reduce((s,e)=>s + Math.abs(e.hours),0);
  return { bank, negative: neg, net: bank - neg };
}
function formatHours(h){ return Number(h).toLocaleString('pt-BR',{maximumFractionDigits:2}); }

function renderIntern(user){
  const intern = findInternById(user.internId);
  root.innerHTML = '';
  const card = document.createElement('div'); card.className='card';

  const totals = calcHoursSummary(intern);
  const totalsHtml = totals.net >= 0
    ? `<div class="total-pill"><div class="small-muted">Banco de horas</div><div class="num">${formatHours(totals.net)} h</div></div>`
    : `<div class="total-pill"><div class="small-muted">Horas negativas</div><div class="num" style="color:var(--danger)">${formatHours(Math.abs(totals.net))} h</div></div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h2>${escapeHtml(intern?.name || user.username)}</h2>
        <div class="muted small">Área do estagiário — insira provas e veja calendário/horas.</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="button ghost" id="btnLogout">Sair</button>
        <button class="button" id="btnExportSelf">Exportar</button>
        ${ user.selfPasswordChange ? '<button class="button ghost" id="btnChangePwdSelf">Alterar senha</button>' : '' }
      </div>
    </div>

    <hr style="margin:12px 0"/>

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="min-width:320px">
        <div class="small-muted">Adicionar prova</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input type="date" id="inpMyProva" class="input" />
          <button class="button alt" id="btnAddMyProva">Adicionar</button>
        </div>
        <div id="provaMsg" class="small-muted" style="margin-top:6px"></div>
      </div>

      <div style="margin-left:auto" id="totalsArea">${totalsHtml}</div>
    </div>

    <div style="margin-top:12px;display:flex;gap:16px;flex-direction:column">
      <div id="calendarWrap" class="card" style="padding:12px"></div>

      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h3>Histórico de lançamentos</h3>
            <div class="muted small">Banco / Negativas</div>
          </div>
          <div>
            ${ hasPower(state.users.find(u=>u.id===session.userId),'manage_hours') ? '<button class="button" id="btnAddEntry">Lançar horas (admin)</button>' : '' }
          </div>
        </div>
        <div id="entriesList" style="margin-top:10px"></div>
      </div>
    </div>
  `;
  root.appendChild(card);

  // default date input to today
  document.getElementById('inpMyProva').value = nowISO();

  // Add prova: check blockDays
  document.getElementById('btnAddMyProva').addEventListener('click', ()=>{
    const d = document.getElementById('inpMyProva').value;
    if(!d) return alert('Escolha uma data');
    const blockDays = Number(state.meta.provaBlockDays || 0);
    const today = new Date(); today.setHours(0,0,0,0);
    const allowedFrom = new Date(today.getTime() + (blockDays+1)*24*60*60*1000);
    const selected = new Date(d + 'T00:00:00');
    const allowedDate = new Date(allowedFrom.getFullYear(), allowedFrom.getMonth(), allowedFrom.getDate());
    if(selected.getTime() <= allowedDate.getTime()){
      const msgEl = document.getElementById('provaMsg');
      msgEl.innerHTML = `<span style="color:var(--danger)"><strong>Período bloqueado. Procurar supervisor ou o Gabriel.</strong></span>`;
      return;
    }
    if(!intern.dates.includes(d)) intern.dates.push(d);
    save(state); render();
  });

  document.getElementById('btnLogout').addEventListener('click', ()=>{ session=null; render(); });
  document.getElementById('btnExportSelf').addEventListener('click', ()=>{ downloadBlob(JSON.stringify({ intern, user }, null, 2), `${(intern.name||user.username).replaceAll(' ','_')}_dados.json`); });

  // change password (self)
  if(user.selfPasswordChange){
    document.getElementById('btnChangePwdSelf').addEventListener('click', ()=> {
      const html = `
        <div style="display:flex;justify-content:space-between;align-items:center"><h3>Alterar minha senha</h3><button id="closeP" class="button ghost">Fechar</button></div>
        <form id="formPwd" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
          <label><span class="small-muted">Senha atual</span><input type="password" id="curPwd" required/></label>
          <label><span class="small-muted">Nova senha</span><input type="password" id="newPwd" required/></label>
          <div style="display:flex;justify-content:flex-end;gap:8px"><button type="submit" class="button">Alterar</button></div>
        </form>
      `;
      const m = showModal(html);
      m.modal.querySelector('#closeP').addEventListener('click', ()=> { m.close(); m.cleanup(); });
      m.modal.querySelector('#formPwd').addEventListener('submit', (ev)=> {
        ev.preventDefault();
        const cur = m.modal.querySelector('#curPwd').value;
        const np = m.modal.querySelector('#newPwd').value;
        const u = state.users.find(x=>x.id===session.userId);
        if(!u) return alert('Usuário não encontrado');
        if(u.password !== cur) return alert('Senha atual incorreta');
        if(!np) return alert('Senha nova inválida');
        u.password = np;
        save(state); alert('Senha alterada'); m.close(); m.cleanup();
      });
    });
  }

  // calendar with month navigation: render initial month and provide prev/next
  let viewing = new Date();
  function renderCalendar(){
    renderCalendarForIntern(intern, viewing);
  }
  renderCalendar();
  renderEntriesList(intern);

  const addBtn = document.getElementById('btnAddEntry');
  if(addBtn) addBtn.addEventListener('click', ()=> showHourEntryForm(intern.id));
}

// ----------------- Calendar renderer (for a given viewing Date) -----------------
function renderCalendarForIntern(intern, viewing){
  const wrap = document.getElementById('calendarWrap');
  const monthStart = new Date(viewing.getFullYear(), viewing.getMonth(), 1);
  const label = monthStart.toLocaleString('pt-BR',{month:'long', year:'numeric'});
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><strong>Calendário</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="button ghost" id="prevMonth">&lt;</button>
        <div class="small-muted" id="monthLabel">${label}</div>
        <button class="button ghost" id="nextMonth">&gt;</button>
      </div>
    </div>
    <div class="calendar" style="grid-template-columns:repeat(7,1fr);font-weight:700;color:var(--muted)">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="monthGrid" class="calendar" style="margin-top:10px"></div>
  `;
  const grid = document.getElementById('monthGrid');
  grid.innerHTML = '';
  const firstDay = new Date(viewing.getFullYear(), viewing.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewing.getFullYear(), viewing.getMonth()+1, 0).getDate();

  for(let i=0;i<firstDay;i++){
    const blank = document.createElement('div'); blank.className='day'; blank.style.visibility='hidden'; blank.innerHTML='&nbsp;'; grid.appendChild(blank);
  }
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(viewing.getFullYear(), viewing.getMonth(), d);
    const iso = date.toISOString().slice(0,10);
    const dayEl = document.createElement('div'); dayEl.className='day';
    dayEl.innerHTML = `<div class="date">${d}</div>`;
    if(intern.dates && intern.dates.includes(iso)){
      const pill = document.createElement('div'); pill.className='tag bank'; pill.textContent = 'Prova';
      // if current session is this intern, allow remove button
      const currentUser = state.users.find(u=>u.id===session.userId);
      if(currentUser && currentUser.role === 'intern' && currentUser.internId === intern.id){
        const rem = document.createElement('button'); rem.className='button ghost'; rem.style.marginLeft='8px'; rem.textContent='Remover';
        rem.addEventListener('click', (ev)=>{ ev.stopPropagation(); if(confirm('Remover sua prova nesta data?')){ intern.dates = intern.dates.filter(x=>x!==iso); save(state); render(); }});
        const wrapper = document.createElement('div'); wrapper.style.display='flex'; wrapper.style.alignItems='center';
        wrapper.appendChild(pill); wrapper.appendChild(rem);
        dayEl.appendChild(wrapper);
      } else {
        dayEl.appendChild(pill);
      }
    }
    (intern.hoursEntries||[]).filter(e=>e.date===iso).forEach(e=>{
      const tag = document.createElement('div'); tag.className = 'tag ' + (e.hours>0 ? 'bank' : 'neg'); tag.textContent = `${e.hours>0?'+':''}${e.hours}h`;
      dayEl.appendChild(tag);
    });
    dayEl.addEventListener('click', ()=> openDayDetails(intern, iso));
    grid.appendChild(dayEl);
  }

  document.getElementById('prevMonth').addEventListener('click', ()=>{
    viewing.setMonth(viewing.getMonth()-1);
    renderCalendarForIntern(intern, viewing);
  });
  document.getElementById('nextMonth').addEventListener('click', ()=>{
    viewing.setMonth(viewing.getMonth()+1);
    renderCalendarForIntern(intern, viewing);
  });
}

// ----------------- Day details modal -----------------
function openDayDetails(intern, iso){
  const provas = intern.dates.filter(d=>d===iso);
  const entries = (intern.hoursEntries||[]).filter(e=>e.date===iso);
  const htmlParts = [];
  htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Detalhes — ${iso}</h3><button id="closeD" class="button ghost">Fechar</button></div>`);
  htmlParts.push('<div style="margin-top:8px">');
  htmlParts.push('<h4>Provas</h4>');
  if(provas.length===0) htmlParts.push('<div class="muted small">Nenhuma prova nesta data</div>');
  else provas.forEach(p=> htmlParts.push(`<div class="row"><div>${p} • <span class="small-muted">Prova registrada</span></div></div>`));
  htmlParts.push('<hr/>');
  htmlParts.push('<h4>Lançamentos</h4>');
  if(entries.length===0) htmlParts.push('<div class="muted small">Nenhum lançamento</div>');
  else entries.forEach(e=>{
    htmlParts.push(`<div class="row"><div><strong>${e.hours>0?'+':''}${e.hours}h</strong> ${e.type==='bank'?'(Banco)':'(Negativa)'}<div class="small-muted">${escapeHtml(e.reason||'')}</div><div class="audit">Criado por: ${escapeHtml(e.createdByName||'—')} em ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}${e.lastModifiedBy ? ' • Alterado por: '+escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: '+escapeHtml(e.compensatedBy)+' em '+(e.compensatedAt? new Date(e.compensatedAt).toLocaleString(): '') : ''}</div></div><div><div style="display:flex;gap:6px">${ hasPower(state.users.find(u=>u.id===session.userId),'manage_hours') ? `<button class="button ghost" data-edit="${e.id}">Editar</button> <button class="button" data-delete="${e.id}">Excluir</button> ${e.hours<0 ? (e.compensated ? `<button class="button ghost" data-uncomp="${e.id}">Desfazer comp.</button>` : `<button class="button" data-comp="${e.id}">Marcar comp.</button>`) : '' }` : '' }</div></div></div>`);
  });
  htmlParts.push('</div>');

  const m = showModal(htmlParts.join(''), { allowBackdropClose:true });
  m.modal.querySelector('#closeD').addEventListener('click', ()=> { m.close(); m.cleanup(); });

  m.modal.querySelectorAll('[data-delete]').forEach(btn=> btn.addEventListener('click', ()=>{
    const id = btn.getAttribute('data-delete');
    if(!confirm('Excluir lançamento?')) return;
    const entry = (intern.hoursEntries||[]).find(x=>x.id===id);
    const manager = state.users.find(u=>u.id===session.userId);
    if(entry){
      intern.auditLog = intern.auditLog || [];
      intern.auditLog.push({ id: uuid(), action:'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${entry.id} (${entry.hours}h ${entry.type})` });
      intern.hoursEntries = intern.hoursEntries.filter(x=>x.id!==id);
      save(state); m.close(); m.cleanup(); render();
    }
  }));

  m.modal.querySelectorAll('[data-comp]').forEach(btn=> btn.addEventListener('click', ()=>{
    const id = btn.getAttribute('data-comp');
    markCompensated(intern.id, id, true);
    const manager = state.users.find(u=>u.id===session.userId);
    intern.auditLog = intern.auditLog || [];
    intern.auditLog.push({ id: uuid(), action:'compensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Compensou lançamento ${id}` });
    save(state); m.close(); m.cleanup(); render();
  }));

  m.modal.querySelectorAll('[data-uncomp]').forEach(btn=> btn.addEventListener('click', ()=>{
    const id = btn.getAttribute('data-uncomp');
    markCompensated(intern.id, id, false);
    const manager = state.users.find(u=>u.id===session.userId);
    intern.auditLog = intern.auditLog || [];
    intern.auditLog.push({ id: uuid(), action:'uncompensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Desfez compensação de ${id}` });
    save(state); m.close(); m.cleanup(); render();
  }));

  m.modal.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', ()=>{
    const id = btn.getAttribute('data-edit');
    m.close(); m.cleanup(); showHourEntryForm(intern.id, id);
  }));
}

// ----------------- Entries list -----------------
function renderEntriesList(intern){
  const list = document.getElementById('entriesList'); if(!list) return;
  list.innerHTML = '';
  const arr = (intern.hoursEntries||[]).slice().sort((a,b)=> b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if(arr.length===0){ list.innerHTML = '<div class="muted">Nenhum lançamento</div>'; return; }
  arr.forEach(e=>{
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-weight:700">${e.date} — ${e.hours>0?'+':''}${e.hours}h ${e.type==='bank'?'(Banco)':'(Negativa)'} ${e.compensated? '• Compensado':''}</div><div class="small-muted">${escapeHtml(e.reason||'')}</div><div class="audit">Criado por: ${escapeHtml(e.createdByName||'—')} em ${e.createdAt? new Date(e.createdAt).toLocaleString() : ''}</div>`;
    const right = document.createElement('div');
    if(hasPower(state.users.find(u=>u.id===session.userId),'manage_hours')){
      const btnEdit = document.createElement('button'); btnEdit.className='button ghost'; btnEdit.textContent='Editar'; btnEdit.addEventListener('click', ()=> showHourEntryForm(intern.id, e.id));
      const btnDel = document.createElement('button'); btnDel.className='button'; btnDel.textContent='Excluir'; btnDel.addEventListener('click', ()=> { if(confirm('Excluir lançamento?')){ const manager = state.users.find(u=>u.id===session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action:'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${e.id} (${e.hours}h ${e.type})` }); intern.hoursEntries = intern.hoursEntries.filter(x=>x.id!==e.id); save(state); render(); }});
      right.appendChild(btnEdit); right.appendChild(btnDel);
      if(e.hours<0){
        const btnComp = document.createElement('button'); btnComp.className = e.compensated ? 'button ghost' : 'button'; btnComp.textContent = e.compensated ? 'Desfazer comp.' : 'Marcar compensado';
        btnComp.addEventListener('click', ()=> { markCompensated(intern.id,e.id, !e.compensated); const manager = state.users.find(u=>u.id===session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action: e.compensated ? 'uncompensated' : 'compensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `${e.compensated ? 'Desfez compensação' : 'Compensou'} lançamento ${e.id}` }); save(state); render(); });
        right.appendChild(btnComp);
      }
    }
    row.appendChild(left); row.appendChild(right); list.appendChild(row);
  });
}

// ----------------- Hour entry modal (create/edit) -----------------
function showHourEntryForm(internId, entryId){
  const intern = findInternById(internId);
  if(!intern) return;
  const isEdit = !!entryId;
  const existing = isEdit ? (intern.hoursEntries||[]).find(e=>e.id===entryId) : null;
  const currentManager = state.users.find(u=>u.id===session.userId);
  if(!hasPower(currentManager,'manage_hours')) return alert('Sem permissão para gerenciar horas.');
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>${isEdit ? 'Editar' : 'Lançar'} horas — ${escapeHtml(intern.name)}</h3><button id="closeH" class="button ghost">Fechar</button></div>
    <form id="formHours" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      <label><span class="small-muted">Data</span><input type="date" id="h_date" value="${existing?existing.date:nowISO()}" required /></label>
      <label><span class="small-muted">Tipo</span>
        <select id="h_type"><option value="bank">Banco (crédito)</option><option value="negative">Negativa (falta)</option></select>
      </label>
      <label><span class="small-muted">Quantidade de horas (número)</span><input id="h_hours" value="${existing?Math.abs(existing.hours):8}" type="number" min="0.25" step="0.25" required /></label>
      <label><span class="small-muted">Justificativa / observações</span><textarea id="h_reason" rows="3">${existing?escapeHtml(existing.reason||''):''}</textarea></label>
      <label><input type="checkbox" id="h_comp" ${existing && existing.compensated ? 'checked' : ''}/> Marcar como compensado (aplica-se a negativas)</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">${isEdit ? 'Salvar' : 'Lançar'}</button>
      </div>
    </form>
  `;
  const m = showModal(html);
  const modal = m.modal;
  modal.querySelector('#closeH').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  if(existing) modal.querySelector('#h_type').value = existing.type;
  modal.querySelector('#formHours').addEventListener('submit', (ev)=> {
    ev.preventDefault();
    const date = modal.querySelector('#h_date').value;
    const type = modal.querySelector('#h_type').value;
    const hoursRaw = modal.querySelector('#h_hours').value;
    const hoursNum = Number(hoursRaw);
    if(!date || !hoursNum || isNaN(hoursNum) || hoursNum<=0) return alert('Dados inválidos');
    const reason = modal.querySelector('#h_reason').value || '';
    const comp = !!modal.querySelector('#h_comp').checked;
    const manager = state.users.find(u=>u.id===session.userId);
    if(isEdit && existing){
      existing.date = date;
      existing.type = type;
      existing.hours = type==='bank' ? hoursNum : -hoursNum;
      existing.reason = reason;
      existing.lastModifiedBy = manager.username;
      existing.lastModifiedAt = timestamp();
      existing.compensated = comp;
      save(state);
      intern.auditLog = intern.auditLog || [];
      intern.auditLog.push({ id: uuid(), action:'edit_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Editou lançamento ${existing.id}` });
    } else {
      const entry = { id: uuid(), date, type, hours: type==='bank'? hoursNum : -hoursNum, reason, compensated: comp, createdById: manager.id, createdByName: manager.username, createdAt: timestamp() };
      intern.hoursEntries = intern.hoursEntries || [];
      intern.hoursEntries.push(entry);
      intern.auditLog = intern.auditLog || [];
      intern.auditLog.push({ id: uuid(), action:'create_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou lançamento ${entry.id} (${entry.hours}h ${entry.type})` });
    }
    save(state); m.close(); m.cleanup(); render();
  });
}

// ----------------- Mark compensated -----------------
function markCompensated(internId, entryId, flag){
  const intern = findInternById(internId);
  if(!intern) return;
  const entry = (intern.hoursEntries||[]).find(e=>e.id===entryId);
  if(!entry) return;
  entry.compensated = !!flag;
  if(flag){
    entry.compensatedBy = state.users.find(u=>u.id===session.userId).username;
    entry.compensatedAt = timestamp();
  } else {
    entry.compensatedBy = null;
    entry.compensatedAt = null;
  }
  save(state);
}

// ----------------- MANAGER PANEL -----------------
function renderManager(user){
  root.innerHTML = '';
  const wrapper = document.createElement('div'); wrapper.className='grid';

  const left = document.createElement('div');
  left.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2>Painel de Gestão</h2>
          <div class="muted small">Usuário: ${escapeHtml(user.username)} • ${escapeHtml(user.role)}</div>
        </div>
        <div>
          <button class="button ghost" id="btnLogoutMgr">Sair</button>
        </div>
      </div>
      <hr style="margin:10px 0" />
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input id="searchMgmt" placeholder="Pesquisar por nome, usuário ou ID" />
        <button id="btnNewUser" class="button ghost">Novo usuário</button>
      </div>
      <div class="muted small">Total de usuários: <span id="totalUsers"></span></div>
      <div class="list" id="usersList" style="margin-top:10px"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="btnDownloadAll" class="button">Exportar todos (.json)</button>
        <button id="btnImportAll" class="button ghost">Importar (.json)</button>
        <input type="file" id="fileMgmt" style="display:none" accept="application/json" />
      </div>
    </div>
  `;

  const right = document.createElement('div');
  // Aqui: separando claramente o filtro por data (SOMENTE provas) e a pesquisa por nome (independente)
  right.innerHTML = `
    <div class="card">
      <h3>Filtro por data (somente PROVAS)</h3>
      <div class="muted small">Exibe apenas estagiários que têm prova cadastrada na data escolhida.</div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <input type="date" id="mgrFilterDate" />
        <button class="button" id="btnApplyFilter">Buscar</button>
        <button class="button ghost" id="btnClearDateFilter">Limpar</button>
      </div>
      <hr style="margin:10px 6px" />
      <h3>Pesquisar por nome (independente da data)</h3>
      <div class="muted small">Pesquise por estagiário — lista dinâmica. Clique para abrir detalhes.</div>
      <div style="margin-top:8px;position:relative">
        <input id="mgrNameSearch" placeholder="Pesquisar por nome do estagiário" autocomplete="off" />
        <div id="mgrNameDropdown" class="dropdown" style="position:absolute;left:0;right:0;z-index:30;display:none;background:#fff;border:1px solid #eee;max-height:220px;overflow:auto"></div>
      </div>
      <div id="mgrResults" style="margin-top:12px"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Relatórios de Horas</h3>
      <div class="muted small">Saldo líquido por estagiário (banco - negativas não compensadas)</div>
      <div id="reportsArea" style="margin-top:8px"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Configurações</h3>
      <div class="small-muted">Bloqueio para marcação de provas (dias)</div>
      <div class="settings-row">
        <select id="cfgBlockDays">${ new Array(31).fill(0).map((_,i)=>`<option value="${i}">${i} dias</option>`).join('') }</select>
        <button class="button" id="btnSaveConfig">Salvar</button>
      </div>
    </div>
  `;

  wrapper.appendChild(left); wrapper.appendChild(right);
  root.appendChild(wrapper);

  document.getElementById('btnLogoutMgr').addEventListener('click', ()=>{ session=null; render(); });
  document.getElementById('btnNewUser').addEventListener('click', ()=> showCreateUserForm(user));
  document.getElementById('btnDownloadAll').addEventListener('click', ()=> downloadBlob(JSON.stringify(state,null,2), 'backup_provas_all.json'));
  document.getElementById('btnImportAll').addEventListener('click', ()=> document.getElementById('fileMgmt').click());
  document.getElementById('fileMgmt').addEventListener('change', (ev)=>{ const f = ev.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = e=>{ try{ const parsed = JSON.parse(e.target.result); if(!parsed.users || !parsed.interns) throw new Error('Formato inválido'); state = parsed; if(!state.meta) state.meta = {}; if(typeof state.meta.provaBlockDays === 'undefined') state.meta.provaBlockDays = 0; save(state); alert('Importação concluída'); render(); }catch(err){ alert('Erro ao importar: '+err.message); } }; r.readAsText(f); });

  document.getElementById('searchMgmt').addEventListener('input', renderUsersList);
  document.getElementById('btnApplyFilter').addEventListener('click', ()=> applyDateFilter());
  document.getElementById('btnClearDateFilter').addEventListener('click', ()=> { document.getElementById('mgrFilterDate').value=''; document.getElementById('mgrResults').innerHTML=''; });

  // Name search dropdown handlers
  const nameInput = document.getElementById('mgrNameSearch');
  const dropdown = document.getElementById('mgrNameDropdown');

  nameInput.addEventListener('input', (ev)=> {
    const q = ev.target.value.trim().toLowerCase();
    renderNameDropdown(q);
  });

  nameInput.addEventListener('focus', (ev)=> {
    const q = ev.target.value.trim().toLowerCase();
    renderNameDropdown(q);
  });

  // close dropdown when clicking outside
  document.addEventListener('click', (ev)=>{
    if(!ev.target.closest('#mgrNameSearch') && !ev.target.closest('#mgrNameDropdown')){
      dropdown.style.display = 'none';
    }
  });

  // open default values
  document.getElementById('mgrFilterDate').value = nowISO();

  document.getElementById('cfgBlockDays').value = String(state.meta.provaBlockDays || 0);
  document.getElementById('btnSaveConfig').addEventListener('click', ()=> {
    const val = Number(document.getElementById('cfgBlockDays').value || 0);
    state.meta.provaBlockDays = val;
    save(state);
    alert('Configuração salva (bloqueio: '+val+' dias).');
  });

  renderUsersList();
  renderReports();
  applyDateFilter(); // aplica filtro inicial (padrão hoje)
}

// ----------------- renderUsersList (esquerda) -----------------
function renderUsersList(){
  const q = document.getElementById('searchMgmt').value.trim().toLowerCase();
  const container = document.getElementById('usersList'); container.innerHTML='';
  let list = state.users.slice();
  if(q) list = list.filter(u => (u.username||'').toLowerCase().includes(q) || (u.internId && findInternById(u.internId)?.name.toLowerCase().includes(q)) || (u.id||'').toLowerCase().includes(q));
  document.getElementById('totalUsers').textContent = list.length;
  list.sort((a,b)=> (a.role===b.role? a.username.localeCompare(b.username,'pt-BR') : a.role.localeCompare(b.role)));

  list.forEach(u=>{
    const row = document.createElement('div'); row.className = 'row';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${escapeHtml(u.username)} ${u.role === 'intern' ? '— ' + escapeHtml(findInternById(u.internId)?.name || '') : ''}</div><div class="muted small">${u.id} • ${u.role}</div>`;
    const right = document.createElement('div');
    const btnView = document.createElement('button'); btnView.className='button ghost'; btnView.textContent='Abrir'; btnView.addEventListener('click', ()=> openUserManagerView(u.id));
    const btnEdit = document.createElement('button'); btnEdit.className='button'; btnEdit.textContent='Editar'; btnEdit.addEventListener('click', ()=> showEditUserForm(u.id));
    right.appendChild(btnView); right.appendChild(btnEdit);
    row.appendChild(left); row.appendChild(right);
    container.appendChild(row);
  });
}

// ----------------- UPDATED renderReports() -----------------
function renderReports(){
  const area = document.getElementById('reportsArea'); area.innerHTML = '';

  // Compute net per intern: net = bank - negatives_not_compensated
  const computed = state.interns.map(i=>{
    const totalBank = (i.hoursEntries||[]).filter(e=>e.hours>0).reduce((s,e)=>s+e.hours,0);
    const totalNeg = (i.hoursEntries||[]).filter(e=>e.hours<0 && !e.compensated).reduce((s,e)=>s + Math.abs(e.hours),0);
    const net = totalBank - totalNeg;
    return { id: i.id, name: i.name, bank: totalBank, neg: totalNeg, net };
  });

  const negatives = computed.filter(x => x.net < 0).sort((a,b)=> Math.abs(b.net) - Math.abs(a.net)); // biggest negative first
  const banks = computed.filter(x => x.net > 0).sort((a,b)=> b.net - a.net); // biggest positive first

  const negHtml = `<div style="margin-top:8px"><h4>Horas negativas (saldo líquido)</h4>${negatives.length===0?'<div class="muted small">Nenhum</div>': negatives.map(n=>{
    return `<div class="row"><div><strong>${escapeHtml(n.name)}</strong><div class="small-muted">${n.id}</div></div><div><span class="badge" style="background:rgba(239,68,68,0.08);color:var(--danger)">${Math.abs(n.net)}h</span></div></div>`;
  }).join('')}</div>`;

  const bankHtml = `<div style="margin-top:12px"><h4>Banco de horas (saldo líquido)</h4>${banks.length===0?'<div class="muted small">Nenhum</div>': banks.map(n=>{
    return `<div class="row"><div><strong>${escapeHtml(n.name)}</strong><div class="small-muted">${n.id}</div></div><div><span class="badge" style="background:rgba(154,205,154,0.12);color:var(--accent-2)">${n.net}h</span></div></div>`;
  }).join('')}</div>`;

  area.innerHTML = negHtml + bankHtml;
}

// ----------------- Remaining manager helpers (unchanged) -----------------
function openUserManagerView(userId){
  const u = state.users.find(x=>x.id===userId); if(!u) return;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  const intern = u.internId ? findInternById(u.internId) : null;
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>${escapeHtml(u.username)} ${u.role === 'intern' ? '• ' + escapeHtml(intern?.name || '') : ''}</h3>
        <div class="muted small">ID: ${u.id}</div>
      </div>
      <div>
        <button class="button ghost" id="btnCloseView">Fechar</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <div class="small-muted">Role: ${u.role}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="btnResetPwd" class="button ghost">Alterar/Resetar senha</button>
        <button id="btnManageDates" ${u.role!=='intern' ? 'disabled' : ''} class="button ghost">Gerenciar provas</button>
        <button id="btnManageHours" ${u.role!=='intern' ? 'disabled' : ''} class="button ghost">Gerenciar horas</button>
        <button id="btnDeleteUser" class="button danger">Excluir usuário</button>
      </div>
    </div>
    <div id="mgrUserBody" style="margin-top:10px"></div>
  `;
  card.innerHTML = html;
  area.appendChild(card);

  document.getElementById('btnCloseView').addEventListener('click', ()=> applyDateFilter());
  document.getElementById('btnResetPwd').addEventListener('click', ()=> {
    const currentManager = state.users.find(uu=>uu.id===session.userId);
    if(!hasPower(currentManager, 'reset_password')) return alert('Você não tem permissão para resetar senhas.');
    const np = prompt(`Defina nova senha para ${u.username} (vazio cancela)`);
    if(!np) return;
    u.password = np;
    save(state);
    alert('Senha alterada.');
  });
  document.getElementById('btnManageDates').addEventListener('click', ()=> {
    if(u.role!=='intern') return;
    openInternManagerView(u.internId);
  });
  document.getElementById('btnManageHours').addEventListener('click', ()=> {
    if(u.role!=='intern') return;
    openInternHoursView(u.internId);
  });
  document.getElementById('btnDeleteUser').addEventListener('click', ()=> {
    const mgr = state.users.find(uu=>uu.id===session.userId);
    if(!hasPower(mgr, 'delete_user')) return alert('Você não tem permissão para excluir usuários.');
    if(!confirm('Excluir este usuário e (se houver) estagiário associado? Esta ação é irreversível.')) return;
    if(u.internId){
      state.interns = state.interns.filter(i=>i.id !== u.internId);
      state.users = state.users.filter(x=> x.internId !== u.internId);
    } else {
      state.users = state.users.filter(x=> x.id !== u.id);
    }
    save(state);
    alert('Removido.');
    render();
  });
}

function openInternManagerView(internId){
  const intern = findInternById(internId); if(!intern) return;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>${escapeHtml(intern.name)}</h3>
        <div class="muted small">ID: ${intern.id}</div>
      </div>
      <div>
        <button class="button ghost" id="btnCloseViewIntern">Fechar</button>
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <input type="date" id="mgrAddDate" />
      <button id="mgrAddDateBtn" class="button">Adicionar prova</button>
    </div>
    <div id="mgrDates" style="margin-top:10px"></div>

    <div style="margin-top:12px">
      <h4>Log de ações</h4>
      <div id="mgrAudit" class="muted small"></div>
    </div>
  `;
  area.appendChild(card);
  document.getElementById('btnCloseViewIntern').addEventListener('click', ()=> applyDateFilter());
  document.getElementById('mgrAddDateBtn').addEventListener('click', ()=>{ const d = document.getElementById('mgrAddDate').value; if(!d) return alert('Escolha uma data'); if(!intern.dates.includes(d)) intern.dates.push(d); // audit
      const manager = state.users.find(u=>u.id===session.userId);
      intern.auditLog = intern.auditLog || [];
      intern.auditLog.push({ id: uuid(), action:'create_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou prova ${d}` });
      save(state); openInternManagerView(intern.id); renderUsersList(); });
  renderMgrDates(intern);
  const auditEl = document.getElementById('mgrAudit'); const auditArr = (intern.auditLog||[]).slice().sort((a,b)=> b.at.localeCompare(a.at));
  if(auditArr.length===0) auditEl.innerHTML = 'Nenhuma ação administrativa registrada';
  else auditEl.innerHTML = auditArr.map(a=>`${new Date(a.at).toLocaleString()} — ${escapeHtml(a.byUserName)} — ${escapeHtml(a.action)} — ${escapeHtml(a.details||'')}`).join('<br/>');
}

function renderMgrDates(intern){
  const el = document.getElementById('mgrDates'); el.innerHTML='';
  if(!intern.dates || intern.dates.length===0){ el.innerHTML='<div class="muted">Nenhuma prova cadastrada</div>'; return; }
  intern.dates.slice().sort().forEach(d=>{
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${d}</div><div class="muted small">Data da prova</div>`;
    const right = document.createElement('div'); const btnDel = document.createElement('button'); btnDel.className='button ghost'; btnDel.textContent='Remover'; btnDel.addEventListener('click', ()=>{ if(confirm('Remover prova '+d+'?')){ intern.dates = intern.dates.filter(x=>x!==d); const manager = state.users.find(u=>u.id===session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action:'remove_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Removida prova ${d}` }); save(state); render(); }});
    right.appendChild(btnDel);
    row.appendChild(left); row.appendChild(right); el.appendChild(row);
  });
}

function openInternHoursView(internId){
  const intern = findInternById(internId); if(!intern) return;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>Horas — ${escapeHtml(intern.name)}</h3>
        <div class="muted small">Lançamentos e compensações.</div>
      </div>
      <div>
        <button class="button ghost" id="btnCloseHours">Fechar</button>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <button id="btnAddHoursAdmin" class="button">Lançar horas (admin)</button>
    </div>
    <div id="mgrHoursList" style="margin-top:10px"></div>
  `;
  area.appendChild(card);
  document.getElementById('btnCloseHours').addEventListener('click', ()=> applyDateFilter());
  document.getElementById('btnAddHoursAdmin').addEventListener('click', ()=> showHourEntryForm(intern.id));
  renderMgrHoursList(intern);
}

function renderMgrHoursList(intern){
  const el = document.getElementById('mgrHoursList'); el.innerHTML='';
  const arr = (intern.hoursEntries||[]).slice().sort((a,b)=> b.date.localeCompare(a.date));
  if(arr.length===0){ el.innerHTML='<div class="muted">Nenhum lançamento</div>'; return; }
  arr.forEach(e=>{
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${e.date} • ${e.hours>0?'+':'-'}${Math.abs(e.hours)}h ${e.type==='bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div><div class="muted small">${escapeHtml(e.reason||'')}</div><div class="audit">Criado por: ${escapeHtml(e.createdByName||'—')} em ${e.createdAt? new Date(e.createdAt).toLocaleString() : ''}${e.lastModifiedBy ? ' • Alterado por: '+escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: '+escapeHtml(e.compensatedBy)+' em '+(e.compensatedAt? new Date(e.compensatedAt).toLocaleString(): '') : ''}</div>`;
    const right = document.createElement('div');
    const btnEdit = document.createElement('button'); btnEdit.className='button ghost'; btnEdit.textContent='Editar'; btnEdit.addEventListener('click', ()=> showHourEntryForm(intern.id, e.id));
    const btnDel = document.createElement('button'); btnDel.className='button'; btnDel.textContent='Excluir'; btnDel.addEventListener('click', ()=> { if(confirm('Excluir lançamento?')){ const manager = state.users.find(u=>u.id===session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action:'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Excluído lançamento ${e.id} (${e.hours}h ${e.type})` }); intern.hoursEntries = intern.hoursEntries.filter(x=>x.id!==e.id); save(state); render(); }});
    right.appendChild(btnEdit); right.appendChild(btnDel);
    if(e.hours<0){
      const btnComp = document.createElement('button'); btnComp.className = e.compensated ? 'button ghost' : 'button'; btnComp.textContent = e.compensated ? 'Desfazer comp.' : 'Marcar compensado';
      btnComp.addEventListener('click', ()=> { markCompensated(intern.id,e.id, !e.compensated); const manager = state.users.find(u=>u.id===session.userId); intern.auditLog = intern.auditLog || []; intern.auditLog.push({ id: uuid(), action: e.compensated ? 'uncompensated' : 'compensated', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `${e.compensated ? 'Desfez compensação' : 'Compensou'} lançamento ${e.id}` }); save(state); render(); });
      right.appendChild(btnComp);
    }
    row.appendChild(left); row.appendChild(right); el.appendChild(row);
  });
}

// ----------------- User creation / edit forms (modals) -----------------
function showCreateUserForm(currentManager){
  if(!hasPower(currentManager,'create_intern') && currentManager.role!=='super') return alert('Sem permissão');
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Criar usuário</h3><button id="closeC" class="button ghost">Fechar</button></div>
    <form id="formCreate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Tipo</span><select id="newType"><option value="intern">Estagiário</option><option value="admin">Admin secundário</option></select></label>
      <label><span class="small-muted">Nome (se estagiário)</span><input id="newName" /></label>
      <label><span class="small-muted">Usuário (login)</span><input id="newUser" required/></label>
      <label><span class="small-muted">Senha</span><input id="newPass" value="senha123" /></label>
      <label><input type="checkbox" id="allowSelfPwd" checked/> Permitir alteração de senha pelo próprio usuário</label>
      <div id="adminPowers" style="display:none">
        <div class="small-muted">Poderes do admin</div>
        <label><input type="checkbox" id="p_create"/> Criar estagiários</label>
        <label><input type="checkbox" id="p_edit"/> Editar usuários</label>
        <label><input type="checkbox" id="p_delete"/> Excluir usuários</label>
        <label><input type="checkbox" id="p_reset"/> Resetar senhas</label>
        <label><input type="checkbox" id="p_manage"/> Gerenciar horas</label>
        <label><input type="checkbox" id="p_delegate"/> Delegar admins (só super pode marcar)</label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Criar</button>
      </div>
    </form>
  `;
  const m = showModal(html);
  const modal = m.modal;
  modal.querySelector('#closeC').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  modal.querySelector('#newType').addEventListener('change', (e)=> {
    modal.querySelector('#adminPowers').style.display = e.target.value==='admin' ? 'block' : 'none';
  });
  modal.querySelector('#formCreate').addEventListener('submit', (ev)=> {
    ev.preventDefault();
    const type = modal.querySelector('#newType').value;
    const uname = modal.querySelector('#newUser').value.trim();
    if(!uname) return alert('Usuário obrigatório');
    const pass = modal.querySelector('#newPass').value || 'senha123';
    const allowSelf = !!modal.querySelector('#allowSelfPwd').checked;
    if(type==='intern'){
      const name = modal.querySelector('#newName').value.trim();
      if(!name) return alert('Nome do estagiário obrigatório');
      const id = uuid();
      state.interns.push({ id, name, dates: [], hoursEntries: [], auditLog: [] });
      state.users.push({ id: uuid(), username: uname, password: pass, role:'intern', internId: id, powers: defaultPowersFor('intern'), selfPasswordChange: !!allowSelf });
      save(state); alert('Estagiário criado'); m.close(); m.cleanup(); render();
    } else {
      const p_create = modal.querySelector('#p_create').checked;
      const p_edit = modal.querySelector('#p_edit').checked;
      const p_delete = modal.querySelector('#p_delete').checked;
      const p_reset = modal.querySelector('#p_reset').checked;
      const p_manage = modal.querySelector('#p_manage').checked;
      const p_delegate = modal.querySelector('#p_delegate').checked && state.users.find(u=>u.id===session.userId).role==='super';
      const powers = { create_intern: p_create, edit_user: p_edit, delete_user: p_delete, reset_password: p_reset, delegate_admins: p_delegate, manage_hours: p_manage };
      state.users.push({ id: uuid(), username: uname, password: pass, role:'admin', powers, selfPasswordChange: true });
      save(state); alert('Admin criado'); m.close(); m.cleanup(); render();
    }
  });
}

function showEditUserForm(userId){
  const u = state.users.find(x=>x.id===userId); if(!u) return;
  const currentManager = state.users.find(uu=>uu.id===session.userId);
  if(u.id !== currentManager.id && !hasPower(currentManager,'edit_user')) return alert('Sem permissão');
  const intern = u.internId ? findInternById(u.internId) : null;
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Editar usuário</h3><button id="closeE" class="button ghost">Fechar</button></div>
    <form id="formEdit" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Usuário (login)</span><input id="editUser" value="${escapeHtml(u.username)}" required/></label>
      ${ u.role === 'intern' ? `<label><span class="small-muted">Nome do estagiário</span><input id="editName" value="${escapeHtml(intern?.name||'')}" /></label>` : '' }
      <label><input type="checkbox" id="editAllowSelf" ${u.selfPasswordChange ? 'checked' : ''}/> Permitir alteração de senha pelo próprio usuário</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Salvar</button>
      </div>
    </form>
  `;
  const m = showModal(html);
  const modal = m.modal;
  modal.querySelector('#closeE').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  modal.querySelector('#formEdit').addEventListener('submit', (ev)=> {
    ev.preventDefault();
    u.username = modal.querySelector('#editUser').value.trim() || u.username;
    if(u.role==='intern' && intern){
      intern.name = modal.querySelector('#editName').value.trim() || intern.name;
    }
    u.selfPasswordChange = !!modal.querySelector('#editAllowSelf').checked;
    save(state); alert('Atualizado'); m.close(); m.cleanup(); render();
  });
}

// ----------------- Filters -----------------
// applyDateFilter agora EXIBE SOMENTE estagiários com PROVAS na data (não considera lançamentos)
function applyDateFilter(){
  const date = document.getElementById('mgrFilterDate').value;
  const area = document.getElementById('mgrResults'); if(!area) return;
  area.innerHTML='';
  if(!date){ area.innerHTML = '<div class="muted">Escolha uma data para filtrar</div>'; return; }
  // Somente provas (i.dates)
  const matched = state.interns.filter(i=> i.dates && i.dates.includes(date) );
  if(matched.length===0){ area.innerHTML = '<div class="muted">Nenhum estagiário com prova nesta data</div>'; return; }
  matched.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).forEach(it=>{
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">ID: ${it.id}</div>`;
    const right = document.createElement('div');
    const btn = document.createElement('button'); btn.className='button'; btn.textContent='Abrir'; btn.addEventListener('click', ()=> openInternManagerView(it.id));
    right.appendChild(btn);
    row.appendChild(left); row.appendChild(right); area.appendChild(row);
  });
}

// ----------------- Name search dropdown (independente) -----------------
// Renderiza a dropdown com estagiários que casam com query de nome. Ao clicar, abre openInternManagerView.
function renderNameDropdown(q){
  const dropdown = document.getElementById('mgrNameDropdown');
  if(!dropdown) return;
  dropdown.innerHTML = '';
  if(!q || q.length < 1){ dropdown.style.display = 'none'; return; }
  // procura apenas entre estagiários (state.interns)
  const matches = state.interns.filter(i => i.name.toLowerCase().includes(q)).slice(0,50);
  if(matches.length === 0){ dropdown.style.display = 'none'; return; }
  matches.forEach(it => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.style.padding = '8px';
    item.style.cursor = 'pointer';
    item.innerHTML = `<div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">${it.id}</div>`;
    item.addEventListener('click', ()=> {
      // ao clicar, abre a view do estagiário
      document.getElementById('mgrNameDropdown').style.display = 'none';
      document.getElementById('mgrNameSearch').value = '';
      openInternManagerView(it.id);
    });
    dropdown.appendChild(item);
  });
  dropdown.style.display = 'block';
}

// ----------------- Init -----------------
render();
window.addEventListener('beforeunload', ()=> save(state));
