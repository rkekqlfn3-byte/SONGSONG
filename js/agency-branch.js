/* ============================================================
   주소 → 공단지사 관할 규칙
   김해·밀양은 이 콘솔의 능력개발·훈련 업무 기준으로 부산지역본부에 배정한다.
   ============================================================ */
const AGENCY_BRANCHES = ['경남서부지사', '경남지사', '부산지역본부', '부산남부지사', '울산지사'];

const AGENCY_ADDRESS_RULES = {
  busanSouth: ['남구', '금정구', '동래구', '수영구', '영도구', '해운대구', '기장군'],
  busanMain: ['북구', '강서구', '동구', '부산진구', '사상구', '사하구', '서구', '연제구', '중구'],
  busanGyeongnam: ['양산', '김해', '밀양'],
  gyeongnam: ['창원', '거제', '통영', '의령', '창녕', '함안'],
  gyeongnamWest: ['진주', '사천', '거창', '남해', '산청', '하동', '함양', '합천'],
};

function normalizeAgencyAddress(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .replace(/부산광역시/g, '부산')
    .replace(/울산광역시/g, '울산')
    .replace(/경상남도/g, '경남');
}

function firstAgencyArea(address, areas) {
  return areas.find(area => address.includes(area)) || '';
}

function suggestAgencyBranch(addressValue) {
  const address = normalizeAgencyAddress(addressValue);
  if (!address) return null;

  if (address.includes('울산')) {
    return { branch: '울산지사', area: '울산광역시' };
  }

  if (address.includes('부산')) {
    const south = firstAgencyArea(address, AGENCY_ADDRESS_RULES.busanSouth);
    if (south) return { branch: '부산남부지사', area: `부산 ${south}` };
    const main = firstAgencyArea(address, AGENCY_ADDRESS_RULES.busanMain);
    if (main) return { branch: '부산지역본부', area: `부산 ${main}` };
    return null;
  }

  const busanGyeongnam = firstAgencyArea(address, AGENCY_ADDRESS_RULES.busanGyeongnam);
  if (busanGyeongnam) return { branch: '부산지역본부', area: busanGyeongnam };

  const west = firstAgencyArea(address, AGENCY_ADDRESS_RULES.gyeongnamWest);
  if (west) return { branch: '경남서부지사', area: west };

  const gyeongnam = firstAgencyArea(address, AGENCY_ADDRESS_RULES.gyeongnam);
  if (gyeongnam) return { branch: '경남지사', area: gyeongnam };
  if (address.includes('경남고성')) return { branch: '경남지사', area: '경남 고성' };

  return null;
}
