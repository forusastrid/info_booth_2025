// admin.js: 검색, 상세보기 및 부스 남은 횟수 증가

async function search(query) {
  const q = encodeURIComponent(query);
  const res = await fetch(`/api/students?search=${q}`);
  const j = await res.json();
  return j;
}

function renderResults(data) {
  const t = document.getElementById('results');
  t.innerHTML = '';
  if (!data.success || data.data.length === 0) {
    t.innerHTML = '<div style="color:var(--muted)">검색 결과가 없습니다.</div>';
    return;
  }
  const list = document.createElement('div');
  data.data.forEach(s => {
    const hasGold = (s.booths || []).some(b => b.isGolden);
    const goldBadge = hasGold ? '<span style="color:#FFD166;margin-left:8px;font-weight:900">★</span>' : '';
    const item = document.createElement('div');
    item.className = 'result-card';
    item.innerHTML = `
      <div>
        <div style="display:flex;align-items:baseline;gap:10px"><strong>${s.name}</strong>${goldBadge}<span class="meta">(${s.student_number})</span></div>
        <div class="meta">전화: ${s.phone} · 등록: ${s.created_at}</div>
      </div>
      <div class="controls">
        <button data-id="${s.id}" class="viewBtn detail-btn">상세</button>
      </div>`;
    list.appendChild(item);
  });
  t.appendChild(list);

  document.querySelectorAll('.viewBtn').forEach(b=>{
    b.addEventListener('click', async (e)=>{
      const id = e.target.dataset.id;
      await loadDetail(id);
    });
  });
}

async function loadDetail(id) {
  const res = await fetch(`/api/students/${id}`);
  const j = await res.json();
  const d = document.getElementById('detail');
  if (!j.success) { d.innerHTML = '<div style="color:red">레코드를 불러오지 못했습니다.</div>'; return; }
  const s = j.data;
  let html = `
    <h3>상세 - ${s.name} (${s.student_number})</h3>
    <div class="confirmation-info">
      <div class="info-row"><span class="info-label">전화번호</span><span class="info-value">${s.phone}</span></div>
      <div class="info-row"><span class="info-label">등록일</span><span class="info-value">${s.created_at}</span></div>
      <div class="info-row"><span class="info-label">총 결제</span><span class="info-value" id="detailTotal">${s.total_price || 0}원</span></div>
    </div>
    <div style="margin-top:12px;">
      <h4>부스 목록</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">`;
  (s.booths || []).forEach(b=>{
    const remainVal = b.remaining || 0;
    const decDisabled = remainVal <= 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
    const rowClass = b.isGolden ? 'booth-row gold' : 'booth-row';
    const remainClass = b.isGolden ? 'remain gold' : 'remain';
    html += `<div class="${rowClass}" style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>부스 ${b.number}</strong> ${b.name}${b.isGolden ? '<span style="color:#FFD166;margin-left:8px;font-weight:900">★</span>' : ''}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="${remainClass}">남은: <span id="remain-${b.number}">${remainVal}</span></div>
          <button data-id="${s.id}" data-booth="${b.number}" class="decBtn" ${decDisabled} style="padding:6px 10px;border-radius:8px;background:#ff7a7a;border:none;color:#001324;font-weight:700;">-1</button>
          <button data-id="${s.id}" data-booth="${b.number}" class="incBtn" style="padding:6px 10px;border-radius:8px;background:#00ffd1;border:none;color:#001324;font-weight:700;">+1</button>
        </div>
      </div>`;
  });
  html += `</div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
      <input id="payAmount" placeholder="추가 결제 금액" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:inherit;width:140px;">
      <button id="payBtn" style="padding:8px 12px;border-radius:8px;background:#00ffd1;border:none;color:#001324;font-weight:700;">결제 추가</button>
      <button id="deleteBtn" style="padding:8px 12px;border-radius:8px;background:#ff6b6b;border:none;color:#001324;font-weight:700;">삭제</button>
    </div>
  </div>`;
  d.innerHTML = html;

  // 결제 추가 버튼
  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.addEventListener('click', async ()=>{
      const val = document.getElementById('payAmount').value.trim();
      const amt = parseInt(val);
      if (isNaN(amt) || amt <= 0) { alert('올바른 금액을 입력하세요'); return; }
      try {
        const res = await fetch(`/api/students/${s.id}/add-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amt }) });
        const j = await res.json();
        if (!j.success) { alert('결제 추가에 실패했습니다: '+ (j.message || '오류')); return; }
        await loadDetail(s.id);
        const r = await search(document.getElementById('adminQuery').value.trim()); renderResults(r);
      } catch (err) { console.error(err); alert('요청 실패'); }
    });
  }

  // 삭제 버튼
  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async ()=>{
      if (!confirm('정말 이 레코드를 삭제하시겠습니까?')) return;
      try {
        const res = await fetch(`/api/students/${s.id}`, { method: 'DELETE' });
        const j = await res.json();
        if (!j.success) { alert('삭제 실패: '+ (j.message || '오류')); return; }
        alert('삭제되었습니다');
        const r = await search(document.getElementById('adminQuery').value.trim()); renderResults(r);
        document.getElementById('detail').innerHTML = '';
      } catch (err) { console.error(err); alert('요청 실패'); }
    });
  }

  document.querySelectorAll('.incBtn').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = btn.dataset.id;
      const booth = parseInt(btn.dataset.booth);
      await adjust(id, booth, 1);
      await loadDetail(id);
    });
  });
  document.querySelectorAll('.decBtn').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = btn.dataset.id;
      const booth = parseInt(btn.dataset.booth);
      // disabled 버튼은 이벤트 방지되지만 추가 체크
      if (btn.disabled) return;
      await adjust(id, booth, -1);
      await loadDetail(id);
    });
  });
}

async function adjust(id, booth_number, delta) {
  try {
    const res = await fetch(`/api/students/${id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ booth_number, delta })
    });
    const j = await res.json();
    if (!j.success) alert('업데이트 실패: '+ (j.message || '오류'));
  } catch (err) { console.error(err); alert('요청 중 오류'); }
}

document.getElementById('adminSearch').addEventListener('click', async ()=>{
  const q = document.getElementById('adminQuery').value.trim();
  const r = await search(q);
  renderResults(r);
});

// 초기 로드: 전체 일부 로딩 (최신 20개)
(async ()=>{
  const r = await search('');
  renderResults(r);
})();