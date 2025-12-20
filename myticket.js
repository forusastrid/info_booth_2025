// myticket.js: 학생이 학번으로 본인 최근 등록 정보를 조회

function formatPrice(price) { return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

async function queryTicket() {
  const q = document.getElementById('qStudent').value.trim();
  const err = document.getElementById('qStudentError');
  err.classList.remove('show');
  if (!/^\d{5}$/.test(q)) { err.classList.add('show'); return; }

  try {
    const res = await fetch(`/api/students?student_number=${q}`);
    const data = await res.json();
    if (!data.success || data.data.length === 0) {
      document.getElementById('result').style.display = 'none';
      document.getElementById('notfound').style.display = 'block';
      return;
    }

    const record = data.data[0]; // 최신 레코드
    document.getElementById('notfound').style.display = 'none';
    document.getElementById('result').style.display = 'block';
    document.getElementById('rName').textContent = record.name;
    document.getElementById('rStudent').textContent = record.student_number;
    document.getElementById('rPhone').textContent = record.phone;

    const rBooths = document.getElementById('rBooths');
    rBooths.innerHTML = '';
    let total = 0;

    // Render booths as mobile-friendly cards
    (record.booths || []).forEach(b => {
      const item = document.createElement('div');
      item.className = 'item';
      if (b.isGolden) item.classList.add('gold');

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';

      const title = document.createElement('div');
      title.style.fontWeight = '800';
      title.style.fontSize = '1rem';
      title.textContent = `부스 ${b.number} · ${b.name}`;
      if (b.isGolden) {
        const star = document.createElement('span');
        star.textContent = ' ★';
        star.style.color = '#FFD166';
        star.style.marginLeft = '8px';
        title.appendChild(star);
      }

      const sub = document.createElement('div');
      sub.style.fontSize = '0.9rem';
      sub.style.color = 'var(--muted)';
      sub.textContent = `가격: ${formatPrice(b.price || 0)}원`;

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';

      const remain = document.createElement('div');
      if (b.isGolden) {
        remain.style.background = 'linear-gradient(90deg,#FFD166,#FFB703)';
        remain.style.color = '#3b1f00';
        item.style.border = '1px solid rgba(255,180,40,0.14)';
        item.style.background = 'linear-gradient(180deg, rgba(255,246,214,0.02), rgba(255,240,200,0.01))';
      } else {
        remain.style.background = 'linear-gradient(90deg,var(--neon-1),var(--neon-2))';
        remain.style.color = '#001324';
      }
      remain.style.padding = '8px 12px';
      remain.style.borderRadius = '999px';
      remain.style.fontWeight = '900';
      remain.textContent = `${b.remaining || 0}회`;

      const hint = document.createElement('div');
      hint.style.fontSize = '0.8rem';
      hint.style.color = 'var(--muted)';
      hint.style.marginTop = '6px';
      hint.textContent = '남은 횟수';

      right.appendChild(remain);
      right.appendChild(hint);

      item.appendChild(left);
      item.appendChild(right);
      rBooths.appendChild(item);

      total += b.price || 0;
    });

    document.getElementById('rTotal').textContent = formatPrice(total) + '원';

    // small scroll into view for mobile
    setTimeout(() => document.getElementById('resCard').scrollIntoView({behavior: 'smooth', block: 'center'}), 80);
  } catch (err) {
    console.error(err);
    alert('조회 중 오류가 발생했습니다.');
  }
}

document.getElementById('qBtn').addEventListener('click', queryTicket);
window.addEventListener('DOMContentLoaded', () => {
  const q = new URLSearchParams(location.search).get('student_number');
  if (q) { document.getElementById('qStudent').value = q; queryTicket(); }
});