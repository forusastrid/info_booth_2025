let currentStep = 1;
let formData = { phone: '', name: '', booths: [] };

// 부스 목록 (실제 부스명으로 변경 가능)
const booths = [
  { number: 1, name: '인포이즘 (INFOISM) [1인]', price: 2000 },
  { number: 2, name: '인포픽 (INFOPICK) [2회]', price: 1000 },
  { number: 3, name: '미니 게임 테라피 (MINI GAME THERAPY) [3회]', price: 2000 },
  { number: 4, name: '타자 게임 (TYPING GAME) [1회]', price: 1000 },
  { number: 5, name: 'INFOISM SUPERPASS (인포이즘 우선 이용권) [1인]', price: 4000 },
  { number: 6, name: 'INFOPASS (인포 모든 부스 이용권) + (1구 키캡 키링 증정) [1인]', price: 6000 },
  { number: 7, name: 'SUPER INFOPASS (인포 모든 부스 우선 이용권) + (1구 키캡 키링 증정) [1인]', price: 8000 }
];

// Optional API base: set window.API_BASE = 'https://api.midnightsky.kro.kr' in index.html to use a hosted API
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');

// 숫자에 천단위 콤마 추가
function formatPrice(price) {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 전화번호 자동 포맷팅
const phoneInput = document.getElementById('phone');
if (phoneInput) {
  phoneInput.addEventListener('input', function (e) {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length >= 11) {
      value = value.substring(0, 11);
      value = value.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (value.length >= 7) {
      value = value.replace(/(\d{3})(\d{3,4})(\d{0,4})/, '$1-$2-$3');
    } else if (value.length >= 3) {
      value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
    }
    e.target.value = value;
  });

  // 엔터키로 다음 단계 이동
  phoneInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      nextStep(2);
    }
  });
}

const nameInput = document.getElementById('name');
if (nameInput) {
  nameInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      nextStep(3);
    }
  });
}
const studentNumberInput = document.getElementById('studentNumber');
if (studentNumberInput) {
  studentNumberInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      nextStep(3);
    }
  });
}

// 부스 카드 생성
function createBoothCards() {
  const boothGrid = document.getElementById('boothGrid');
  boothGrid.innerHTML = '';
  booths.forEach(booth => {
    const card = document.createElement('div');
    card.className = 'booth-card';
    card.dataset.boothNumber = booth.number;
    card.onclick = () => toggleBooth(booth, card);
    card.innerHTML = `
      <div class="booth-number">${booth.number}</div>
      <div class="booth-name">${booth.name}</div>
      <div class="booth-price">${formatPrice(booth.price)}원</div>`;
    boothGrid.appendChild(card);
  });
  updateSelectedBoothsDisplay();
}

// 부스 토글 (중복 선택 가능)
function toggleBooth(booth, cardElement) {
  const index = formData.booths.findIndex(b => b.number === booth.number);
  const isAdding = index === -1;

  if (isAdding) {
    // 선택되지 않은 경우 - 추가 (원본 객체을 복사해서 사용)
    formData.booths.push({ ...booth });
    cardElement.classList.add('selected');

    // 6번: INFOPASS → 1,2,3,4 포함 (non-golden)
    if (booth.number === 6) {
      [1,2,3,4].forEach(n => {
        if (!formData.booths.some(b => b.number === n)) {
          const base = booths.find(b => b.number === n);
          if (base) formData.booths.push({ ...base, price: 0, derived: true, derivedFrom: 6 });
        }
      });
    }

    // 7번: SUPER INFOPASS → 1,2,3,4 포함 + 황금 표시
    if (booth.number === 7) {
      [1,2,3,4].forEach(n => {
        const existing = formData.booths.find(b => b.number === n);
        if (existing) {
          existing.isGolden = true;
          existing.goldenFrom = 7;
        } else {
          const base = booths.find(b => b.number === n);
          if (base) formData.booths.push({ ...base, price: 0, derived: true, derivedFrom: 7, isGolden: true, goldenFrom: 7 });
        }
      });
    }

    // 5번: INFOISM SUPERPASS → 인포이즘(1번)을 황금으로 표시
    if (booth.number === 5) {
      const existing = formData.booths.find(b => b.number === 1);
      if (existing) {
        existing.isGolden = true;
        existing.goldenFrom = 5;
      } else {
        const base = booths.find(b => b.number === 1);
        if (base) formData.booths.push({ ...base, price: 0, derived: true, derivedFrom: 5, isGolden: true, goldenFrom: 5 });
      }
    }

  } else {
    // 이미 선택된 경우 - 제거
    formData.booths.splice(index, 1);
    cardElement.classList.remove('selected');

    // 6번 제거: 파생 항목 제거
    if (booth.number === 6) {
      formData.booths = formData.booths.filter(b => b.derivedFrom !== 6);
    }

    // 7번 제거: 파생 제거 및 7로 표시한 황금 표식 제거
    if (booth.number === 7) {
      formData.booths = formData.booths.filter(b => b.derivedFrom !== 7);
      formData.booths.forEach(b => {
        if (b.goldenFrom === 7) { delete b.isGolden; delete b.goldenFrom; }
      });
    }

    // 5번 제거: 5로 인해 추가/표시된 항목 제거
    if (booth.number === 5) {
      formData.booths = formData.booths.filter(b => b.derivedFrom !== 5);
      formData.booths.forEach(b => {
        if (b.goldenFrom === 5) { delete b.isGolden; delete b.goldenFrom; }
      });
    }
  }

  updateSelectedBoothsDisplay();
  document.getElementById('boothError').classList.remove('show');
} 

// 선택된 부스 표시 업데이트
function updateSelectedBoothsDisplay() {
  const count = formData.booths.length;
  document.getElementById('selectedCount').textContent = count;
  const listContainer = document.getElementById('selectedBoothsDisplay');
  const listBox = document.getElementById('selectedBoothsList');
  if (count > 0) {
    listContainer.innerHTML = '';
    let totalPrice = 0;
    formData.booths.forEach(booth => {
      const tag = document.createElement('span');
      tag.className = 'selected-booth-item';
      if (booth.isGolden) tag.classList.add('gold-tag');
      const star = booth.isGolden ? '<span class="gold-star">★</span>' : '';
      tag.innerHTML = `부스 ${booth.number} - ${booth.name} ${star} <span class="price">${formatPrice(booth.price)}원</span>`;
      listContainer.appendChild(tag);
      // 파생된 부스의 가격은 이미 패스에 포함되어 있으므로 합산하지 않음
      if (!booth.derived) totalPrice += booth.price;
    });
    listBox.classList.add('show');
  } else {
    listBox.classList.remove('show');
  }

  // 카드 상태 업데이트
  document.querySelectorAll('.booth-card').forEach(card => {
    const boothNumber = parseInt(card.dataset.boothNumber);
    const isSelected = formData.booths.some(b => b.number === boothNumber);
    if (isSelected) { card.classList.add('selected'); } else { card.classList.remove('selected'); }
  });
}

// 다음 단계
function nextStep(step) {
  let isValid = true;
  if (step === 2) {
    // 전화번호 검증
    const phone = document.getElementById('phone').value;
    const phoneRegex = /^010-\d{4}-\d{4}$/;
    if (!phoneRegex.test(phone)) { document.getElementById('phoneError').classList.add('show'); isValid = false; }
    else { formData.phone = phone; document.getElementById('phoneError').classList.remove('show'); }
  } else if (step === 3) {
    // 이름 및 학번 검증
    const name = document.getElementById('name').value.trim();
    const studentNumber = document.getElementById('studentNumber').value.trim();
    const studRegex = /^\d{5}$/;
    if (name === '') { document.getElementById('nameError').classList.add('show'); isValid = false; } else { formData.name = name; document.getElementById('nameError').classList.remove('show'); }
    if (!studRegex.test(studentNumber)) { document.getElementById('studentNumberError').classList.add('show'); isValid = false; } else { formData.student_number = studentNumber; document.getElementById('studentNumberError').classList.remove('show'); }
  } else if (step === 4) {
    // 부스 선택 검증 (최소 1개 이상)
    if (formData.booths.length === 0) { document.getElementById('boothError').classList.add('show'); isValid = false; }
    else {
      // 확인 화면 업데이트
      document.getElementById('confirmPhone').textContent = formData.phone;
      document.getElementById('confirmName').textContent = formData.name;
      const csn = document.getElementById('confirmStudentNumber');
      if (csn) csn.textContent = formData.student_number || '';
      // 선택된 부스들을 태그로 표시
      const confirmBooth = document.getElementById('confirmBooth');
      confirmBooth.innerHTML = '';
      let totalPrice = 0;
      formData.booths.forEach(booth => {
        const tag = document.createElement('span');
        tag.className = 'booth-tag';
        tag.innerHTML = `부스 ${booth.number} <span class="booth-tag-price">${formatPrice(booth.price)}원</span>`;
        confirmBooth.appendChild(tag);
        totalPrice += booth.price;
      });
      // 총 가격 표시
      document.getElementById('totalPrice').textContent = formatPrice(totalPrice) + '원';
      document.getElementById('boothError').classList.remove('show');
    }
  }
  if (isValid) {
    if (step === 3) { createBoothCards(); }
    changeStep(step);
  }
}

// 이전 단계
function prevStep(step) { changeStep(step); }

// 단계 변경
function changeStep(step) {
  document.querySelectorAll('.step').forEach(s => { s.classList.remove('active'); });
  document.getElementById(`step${step}`).classList.add('active');
  currentStep = step;
  // 프로그레스 바 업데이트
  const progress = (step / 5) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
  // 부스 선택 화면으로 돌아올 때 선택 상태 복원
  if (step === 3) { setTimeout(() => { updateSelectedBoothsDisplay(); }, 100); }
}

// 폼 제출
async function submitForm() {
  // 총 가격 계산
  let totalPrice = 0;
  formData.booths.forEach(booth => { totalPrice += booth.price; });

  // Python 서버로 데이터 전송
  try {
    const response = await fetch(`${API_BASE || ''}/api/save-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
      body: JSON.stringify({ phone: formData.phone, name: formData.name, student_number: formData.student_number, booths: formData.booths, totalPrice: totalPrice })
    });
    const result = await response.json();
    if (result.success) {
      console.log('데이터 저장 성공:', result);
      // 티켓 정보 로컬에 저장하고 성공 화면으로 이동
      const ticket = {
        id: result.id,
        phone: formData.phone,
        name: formData.name,
        student_number: formData.student_number,
        booths: formData.booths,
        totalPrice: totalPrice,
        created_at: new Date().toISOString()
      };
      localStorage.setItem('lastTicket', JSON.stringify(ticket));
      // 성공 시 성공 화면 표시
      changeStep(5);
    } else {
      console.error('데이터 저장 실패:', result.message);
      alert('데이터 저장 중 오류가 발생했습니다: ' + result.message);
    }
  } catch (error) {
    console.error('데이터 전송 오류:', error);
    alert('서버 연결에 실패했습니다. Python 서버가 실행 중인지 확인하세요.');
  }

  // 3초 후 폼 초기화 및 첫 단계로 이동
  setTimeout(() => { resetForm(); changeStep(1); }, 3000);
}

// 폼 초기화
function resetForm() {
  formData = { phone: '', name: '', student_number: '', booths: [] };
  document.getElementById('phone').value = '';
  document.getElementById('name').value = '';
  const sn = document.getElementById('studentNumber'); if (sn) sn.value = '';
  document.querySelectorAll('.booth-card').forEach(card => { card.classList.remove('selected'); });
  updateSelectedBoothsDisplay();
}

// 초기화
createBoothCards();

