/**
 * 설명에서 주소/장소 추출 및 Nominatim 지오코딩
 * 모든 상세 주소 패턴 지원
 * Node 16 호환: fetch 없을 때 node:https 사용
 */
async function nodeFetch(url, options = {}) {
  const https = await import('node:https');
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https.default : http.default;
    const req = lib.get(url, { headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json: () => Promise.resolve(JSON.parse(data)),
        })
      );
    });
    req.on('error', reject);
  });
}

const safeFetch = typeof fetch !== 'undefined' ? fetch : nodeFetch;

const INVALID_PLACE_WORDS = new Set(['it', 'the', 'all', 'operation', 'business', 'class', 'way', 'you', 'a', 'an', 'this', 'that', 'there', 'here', 'what', 'when', 'how', 'why', 'which', 'who', 'where']);

function isValidPlace(addr) {
  if (!addr || addr.length < 4) return false;
  const lower = addr.toLowerCase().trim();
  const words = lower.split(/[\s,]+/).filter(Boolean);
  if (words.length === 1 && INVALID_PLACE_WORDS.has(words[0])) return false;
  if (words.every((w) => INVALID_PLACE_WORDS.has(w))) return false;
  return true;
}

export function extractAddressFromDescription(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // 1. space_tamnik 스타일: "- 위치: Japan, Tokyo, Suginami City, Naritahigashi 4 Chome-33-9"
  const loc1 = t.match(/(?:^|\n)\s*[-•]\s*(?:위치|Location|Address|주소|住所)[:\s]*([^\n\[\]]+?)(?:\s*\n|$|\s+[-•]\s+영업|\s+[-•]\s+Location)/i);
  if (loc1) {
    const addr = loc1[1].replace(/^[:\s,]+/, '').trim();
    if (addr.length > 10 && isValidPlace(addr)) return addr.startsWith('Japan') || addr.startsWith('日本') ? addr : `Japan, ${addr}`;
  }

  // 2.3 "위치" 다음에 한국어+영문 두 줄 → 영문 우선(Nominatim 호환)
  const krEnBlock = t.match(/(?:위치|Location|Address|주소)[:\s]*\n\s*[가-힣\s\d\-로길구시군면동리]+\s*\n\s*(\d+[\s\w\-]+(?:ro|gil)[\s\w\-.,]*(?:gu|si|do)[\s\w\-.,]*South Korea)/i);
  if (krEnBlock) {
    const enAddr = krEnBlock[1].trim();
    if (enAddr.length > 25 && /South Korea/i.test(enAddr)) return enAddr;
  }

  // 2. "위치: ..." 또는 "Location: ..." (라인 시작) - 하이픈 허용 (2-11-21 등)
  const loc2 = t.match(/(?:위치|Location|Address|주소|住所)[:\s]+([^\n\[\]]+?)(?:\s*\n|$|\s+[-•]\s+영업|\s+[-•]\s+Location|\s*\[)/i);
  if (loc2) {
    let addr = loc2[1].replace(/^[:\s,]+/, '').trim();
    if (addr.length > 8 && isValidPlace(addr)) {
      if (!addr.startsWith('Japan') && !addr.startsWith('日本') && /(Osaka|Tokyo|Kyoto|Fukuoka|Ward|Chuo|Nipponbashi|Chome)/i.test(addr)) {
        addr = `Japan, ${addr}`;
      }
      return addr;
    }
  }

  // 2.5 한국 영문 주소: "South Korea, Seoul, Mapo-gu, Wausan-ro 17-gil, 19-5" (설명란 상세 주소 우선)
  const krEnAddr = t.match(/(?:South Korea|Korea|대한민국)[,\s]+(?:Seoul|Busan|Incheon|Daegu|Gwangju|Daejeon)[,\s]+[\w\s\-]+(?:ro|gil|로|길)[\s,\-]*[\d\-]+(?=\s|$|\.|[가-힣])/i);
  if (krEnAddr) {
    const addr = krEnAddr[0].trim().replace(/\s+/g, ' ');
    if (addr.length > 20) return addr;
  }

  // 3. 미국/태국 상세 주소 (번호+도로명)
  const usAddr = t.match(/\d+[\s\w\.\-]+(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Way|Wat)[^.\n]*?(?:,\s*[A-Za-z가-힣\s]+(?:,\s*[A-Z]{2}|,\s*Thailand)?(?:\s+\d{5})?)/);
  if (usAddr && isValidPlace(usAddr[0])) return usAddr[0].trim();

  // 4. 일본 주소: Japan, Tokyo, 〇〇区〇〇町, 〇〇丁目〇〇番地
  const jpAddr = t.match(/(?:Japan|日本)[,\s]+([^\[\]\n]+?(?:City|区|市|町|Chome|丁目|番地)[^\[\]\n]*)/);
  if (jpAddr && isValidPlace(jpAddr[1])) return `Japan, ${jpAddr[1].trim()}`;

  // 5. 한국 주소: "장소명 (경기 양주시 장흥면 울대리 420-2)" 형식
  const krPlaceAddr = t.match(/([가-힣a-zA-Z0-9\s]+?)\s*\(((?:경기|강원|충북|충남|전북|전남|경북|경남|제주)?\s*(?:서울|부산|인천|대구|광주|대전|제주|양주|수원|성남|용인|고양|부천|안산|안양|평택|시흥|파주|의정부|김포|하남|이천|광주|여주|오산|양평|과천|의왕|군포|안성|포천|가평|연천)[^\n)]*(?:시|군|구|면|동|로|길|리)[^\n)]*[\d\s\-]+)\)/);
  if (krPlaceAddr) {
    const addr = krPlaceAddr[2].replace(/\s+/g, ' ').trim();
    const forGeocode = addr.replace(/^경기\s/, '경기도 ');
    if (addr.length > 5) return forGeocode;
  }

  // 6. 한국 상세 주소 (로/길/동/구/군 포함)
  const krAddr = t.match(/(서울|부산|인천|대구|광주|대전|제주)(?:특별시|광역시|시)?\s*[^\n]*?(?:로|길|동|구|군)\s*[\d\s\-]+/);
  if (krAddr) return krAddr[0].trim();

  if (t.includes('ces') && t.includes('las vegas')) return 'Las Vegas Convention Center, Las Vegas, NV';

  const branchOf = t.match(/([A-Za-z\s]+)\s+branch\s+of\s+([^.\n]+)/i);
  if (branchOf && isValidPlace(branchOf[2])) return `${branchOf[2].trim()}, ${branchOf[1].trim()}`;

  const inCity = t.match(/(?:visited|went to|had|tried|ordered at)\s+([^.\n]+?)\s+in\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i)
    || t.match(/([A-Za-z\s가-힣']+(?:Restaurant|Steakhouse|Burger|Pizza|Sushi|Tea|Mountain|Resort|Center|역|공원|시장|해변|비치|Beach|Park))\s+in\s+([^.\n]+)/i);
  if (inCity && inCity[2] && isValidPlace(inCity[2])) return `${inCity[1].trim()}, ${inCity[2].trim()}`;

  const cityState = t.match(/in\s+([A-Za-z\s]+?)(?=[.,\n]|\s+Today|\s+The\s|$)/i)
    || t.match(/in\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i);
  if (cityState && isValidPlace(cityState[1])) return cityState[1].trim();

  const atPlace = t.match(/at\s+([^.\n]+?)(?:\s+in\s+|\s*,\s*|$)/i);
  if (atPlace && isValidPlace(atPlace[1])) return atPlace[1].trim();

  const cityNeighborhood = t.match(/([A-Za-z\s]+)'s\s+([A-Za-z\s]+)/);
  if (cityNeighborhood && isValidPlace(cityNeighborhood[2])) return `${cityNeighborhood[2].trim()}, ${cityNeighborhood[1].trim()}`;

  const krAddr2 = t.match(/(서울|부산|인천|대구|광주|대전|제주)[^\n.]*(?:시|구|군|동|로|길)?\s*\d*[^\n.]*/)
    || t.match(/(뉴욕\s+차이나타운|뉴욕\s+코리아타운|맨해튼|브루클린)/);
  if (krAddr2) return krAddr2[0].trim();

  const cityCountry = t.match(/([A-Za-z\s가-힣]+(?:City|Town|Village)?)\s*,\s*([A-Za-z\s가-힣]+)/);
  if (cityCountry && isValidPlace(cityCountry[1])) return `${cityCountry[1].trim()}, ${cityCountry[2].trim()}`;

  // 7. 고유명사(장소명) 단독 표기 - "명화라이브올", "OO홀" 등 설명란에 단독으로 나온 경우
  const krVenue = t.match(/(?:^|\n)\s*([가-힣a-zA-Z0-9]{4,20}(?:라이브올|라이브홀|라이브|홀|관|극장|시장|공원|타운|센터|빌딩))\s*(?:\n|$|\s+\d{4}\.\d{2}\.\d{2})/);
  if (krVenue && isValidPlace(krVenue[1])) return `${krVenue[1].trim()}, 대한민국`;

  const places = [
    'Lake Como', 'Lake Como, Italy',
    'New Haven, Connecticut', 'New Haven, CT',
    'Hunter Mountain', 'Hunter Mountain Ski Resort',
    'Austin, Texas', 'Austin, TX',
    'Las Vegas', 'Las Vegas, NV',
    'New York', 'New York City', 'NYC',
    'San Francisco', 'Washington DC',
    'Hong Kong', 'Tokyo', 'Beijing', 'Seoul',
    'Paris', 'London', 'Bangkok', 'Singapore',
    'Fukuoka', 'Osaka', 'Kyoto', 'Yokohama', 'Suwon',
    'Rome', 'Florence', 'Venice', 'Milan', 'Italy',
    '서울', '부산', '제주', '제주도', '인천', '강릉', '속초', '수원',
  ];
  for (const p of places) {
    if (t.toLowerCase().includes(p.toLowerCase())) return p;
  }

  return null;
}

/** 추출된 텍스트가 실제 주소/위치인지 검증 (문장·농담 필터) - export for script use */
export function isValidLocationText(raw) {
  if (!raw || raw.length < 8) return false;
  const r = raw.trim();
  if (/^(특성상|뚝배기|그릇|회전률|맛있|좋아|추천|가보|가봐)/.test(r)) return false;
  if (/\d/.test(r)) return true;
  if (/[,·]/.test(r) && r.length > 12) return true;
  if (/(City|Ward|Chome|丁目|区|市|町|로|길|구|군|면|리|St|Rd|Ave|Japan|Korea|Thailand|Bangkok|Tokyo|Osaka|Seoul)/i.test(r)) return true;
  return false;
}

/** 설명 또는 댓글에서 '위치:'/'주소:' 뒤의 원문 텍스트 추출 (지도 표시용) */
export function extractLocationTextFromDescription(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  // 1. "위치:" / "주소:" 패턴
  const m = t.match(/(?:^|\n)\s*[-•]?\s*(?:위치|Location|Address|주소|住所)[:\s]+([^\n\[\]]+?)(?:\s*\n|$|\s+[-•]\s+영업|\s+[-•]\s+Location)/i)
    || t.match(/(?:위치|Location|Address|주소|住所)[:\s]+([^\n\[\]]+?)(?:\s*\n|$|\s+[-•]\s+영업|\s+[-•]\s+Location|\s*\[)/i);
  if (m) {
    const raw = m[1].replace(/^[:\s,]+/, '').trim();
    if (raw.length > 4 && isValidLocationText(raw)) return raw;
  }

  // 2. "장소명 (경기 양주시 장흥면 울대리 420-2)" 형식 - 괄호 앞 장소명+괄호 안 주소가 지도 표시용
  const krPlace = t.match(/([가-힣a-zA-Z0-9]{2,20})\s*\(((?:경기|강원|충북|충남|전북|전남|경북|경남|제주)?\s*(?:서울|부산|인천|대구|광주|대전|제주|양주|수원|성남|용인|고양|부천|안산|안양|평택|시흥|파주|의정부|김포|하남|이천|광주|여주|오산|양평|과천|의왕|군포|안성|포천|가평|연천)[^\n)]*(?:시|군|구|면|동|로|길|리)[^\n)]*[\d\s\-]+)\)/);
  if (krPlace) {
    const display = `${krPlace[1].trim()} (${krPlace[2].replace(/\s+/g, ' ').trim()})`;
    if (display.length > 5 && isValidLocationText(krPlace[2])) return display;
  }

  // 2.5 한국 영문 주소: "South Korea, Seoul, Mapo-gu, Wausan-ro 17-gil, 19-5" (표시용)
  const krEnLoc = t.match(/(?:South Korea|Korea|대한민국)[,\s]+(?:Seoul|Busan|Incheon|Daegu|Gwangju|Daejeon)[,\s]+[\w\s\-]+(?:ro|gil|로|길)[\s,\-]*[\d\-]+(?=\s|$|\.|[가-힣])/i);
  if (krEnLoc) {
    const raw = krEnLoc[0].trim().replace(/\s+/g, ' ');
    if (raw.length > 20 && isValidLocationText(raw)) return raw;
  }

  // 3. 댓글에 prefix 없이 적힌 한국 상세 주소 (서울 OO구 OO로 265 지하1층 216-128호 등)
  const krRaw = t.match(/(서울|부산|인천|대구|광주|대전|제주)(?:특별시|광역시|시)?\s+[가-힣\s]+(?:구|군)\s+[가-힣\d\s]+(?:로|길)\s*[\d\s\-지하층호]+/);
  if (krRaw) {
    const raw = krRaw[0].replace(/\s+/g, ' ').trim();
    if (raw.length > 12 && isValidLocationText(raw)) return raw;
  }

  return null;
}

/** 투어 일정 형식에서 모든 장소 추출 (DD Month - Venue, City, State, Country) */
export function extractAllAddressesFromTourSchedule(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const m = line.match(/\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[-–—]\s*(.+)/i);
    if (m) {
      const venue = m[1].trim();
      if (venue.length > 5 && !seen.has(venue)) {
        seen.add(venue);
        result.push(venue);
      }
    }
  }
  return result;
}

/** 설명에서 여러 장소 추출 - 타임스탬프/번호 목록 형식 (0:00 Place - Address, 1. Place (주소), - Place (주소))
 * @param {string} description - 설명 텍스트
 * @param {string} [fullTextForHashtags] - 해시태그 추출용 (제목+설명, 제목의 #location 포함)
 */
export function extractMultipleLocations(description, fullTextForHashtags) {
  if (!description || typeof description !== 'string') return [];
  const results = [];
  const lines = description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const tsMatch = line.match(/^\d{1,2}:\d{2}\s+(.+)/);
    if (tsMatch) {
      const rest = tsMatch[1].trim();
      const dash = rest.indexOf(' - ');
      const name = dash >= 0 ? rest.slice(0, dash).trim() : rest;
      const addrPart = dash >= 0 ? rest.slice(dash + 3).trim() : '';
      if (name.length > 2) results.push({ placeName: name, raw: addrPart || name });
      continue;
    }
    const numMatch = line.match(/^\d+[\.\)]\s*(.+)/);
    if (numMatch) {
      const rest = numMatch[1].trim();
      const dash = rest.indexOf(' - ');
      const name = dash >= 0 ? rest.slice(0, dash).trim() : rest;
      const addrPart = dash >= 0 ? rest.slice(dash + 3).trim() : '';
      if (name.length > 2) results.push({ placeName: name, raw: addrPart || name });
      continue;
    }
    const bulletMatch = line.match(/^[-•]\s*(.+)/);
    if (bulletMatch) {
      const rest = bulletMatch[1].trim();
      const paren = rest.match(/^([^(]+)\s*\(([^)]+)\)/);
      if (paren) {
        results.push({ placeName: paren[1].trim(), raw: paren[2].trim() });
      } else if (rest.length > 3) {
        results.push({ placeName: rest, raw: rest });
      }
    }
  }

  const krAddrs = description.matchAll(/(서울|부산|인천|대구|광주|대전|제주|경기|강원|충북|충남|전북|전남|경북|경남)[^\n]*(?:구|군|시|동|로|길)[^\n]*[\d\s\-지하층호]+/g);
  for (const m of krAddrs) {
    const raw = m[0].replace(/\s+/g, ' ').trim();
    if (raw.length > 15 && !results.some((r) => r.raw.includes(raw) || raw.includes(r.raw))) {
      results.push({ placeName: raw.split(/[\s,]+/).slice(0, 3).join(' '), raw });
    }
  }

  // "Location 📍" 또는 "Beautiful Lake Como 📍" 형식 - 각 줄에서 📍 앞 텍스트의 장소명 추출
  const pinLines = description.split(/\r?\n/).filter((l) => l.includes('📍'));
  for (const line of pinLines) {
    const before = line.split('📍')[0].trim();
    const loc = before.replace(/^(?:Beautiful|Stunning|Magnificent|Amazing|Gorgeous|Stunning|Wonderful)\s+/i, '').trim();
    if (loc.length > 3 && !results.some((r) => r.raw.toLowerCase().includes(loc.toLowerCase()))) {
      const geocodeStr = /italy|italia|italian/i.test(description) ? `${loc}, Italy` : loc;
      results.push({ placeName: loc, raw: geocodeStr });
    }
  }

  // "Place in Country" 형식 (Merdivenli in Turkey, Meteora in Greece, Golden Bridge in Vietnam)
  const inCountryRegex = /(?:the\s+)?([A-Za-z\s]+?)\s+in\s+(Turkey|Greece|Vietnam|Italy|Japan|France|Spain|Thailand|Korea|USA|UK|Portugal|Croatia|Iceland|Morocco|Egypt|India|Indonesia|Australia|Mexico|Brazil|Peru|Chile|Argentina)/gi;
  let m;
  while ((m = inCountryRegex.exec(description)) !== null) {
    const place = m[1].replace(/\b(?:ancient city of|the)\s+/gi, '').trim();
    const country = m[2];
    if (place.length > 2 && !results.some((r) => r.raw.toLowerCase().includes(place.toLowerCase()))) {
      results.push({ placeName: place.trim(), raw: `${place.trim()}, ${country}` });
    }
  }

  // "lush Ba Na Hills", "above the Ba Na Hills" 등 - Vietnam 맥락에서 Ba Na Hills 추출
  if (/vietnam|việt nam|da nang|đà nẵng/i.test(description) && /ba na hills|bà nà hills/i.test(description)) {
    const raw = 'Ba Na Hills, Vietnam';
    if (!results.some((r) => r.raw.toLowerCase().includes('ba na hills'))) {
      results.push({ placeName: 'Ba Na Hills', raw });
    }
  }

  // 해시태그에서 장소 추출 (#lakecomo #venice #rome #florence 등)
  const hashtagMap = {
    lakecomo: 'Lake Como, Italy',
    lakecomoitaly: 'Lake Como, Italy',
    venice: 'Venice, Italy',
    rome: 'Rome, Italy',
    florence: 'Florence, Italy',
    milan: 'Milan, Italy',
    amalficoast: 'Amalfi Coast, Italy',
    cinqueterre: 'Cinque Terre, Italy',
    positano: 'Positano, Italy',
    naples: 'Naples, Italy',
    napoli: 'Naples, Italy',
    sicily: 'Sicily, Italy',
    italy: 'Italy',
    turkey: 'Turkey',
    greece: 'Greece',
    vietnam: 'Vietnam',
    meteora: 'Meteora, Greece',
    merdivenli: 'Merdivenli, Turkey',
    goldenbridge: 'Golden Bridge, Vietnam',
    banahills: 'Ba Na Hills, Vietnam',
    sunworldbanahills: 'Sun World Ba Na Hills, Vietnam',
    tokyo: 'Tokyo, Japan',
    seoul: 'Seoul, South Korea',
    paris: 'Paris, France',
    london: 'London, UK',
    barcelona: 'Barcelona, Spain',
    australia: 'Australia',
    travelaustralia: 'Australia',
    visitnsw: 'New South Wales, Australia',
    coffsharbour: 'Coffs Harbour, Australia',
    bigbanana: 'The Big Banana, Coffs Harbour, Australia',
    baldheadtrail: 'Bald Head Trail, Albany, Western Australia',
    albanywa: 'Albany, Western Australia',
    visitmelbourne: 'Melbourne, Australia',
    melbourne: 'Melbourne, Australia',
    sydney: 'Sydney, Australia',
    perth: 'Perth, Australia',
    tasmania: 'Tasmania, Australia',
    highcountry: 'Victoria High Country, Australia',
    gippsland: 'East Gippsland, Victoria, Australia',
    eastgippsland: 'East Gippsland, Victoria, Australia',
    australiatravel: 'Australia',
    oregon: 'Oregon, USA',
    oregoncoast: 'Oregon Coast, USA',
    seattle: 'Seattle, USA',
    visitseattle: 'Seattle, USA',
    seattlewashington: 'Seattle, USA',
    daintreerainforest: 'Daintree Rainforest, Australia',
    rainforest: 'Daintree Rainforest, Australia',
    newzealand: 'New Zealand',
    auckland: 'Auckland, New Zealand',
    rotorua: 'Rotorua, New Zealand',
    hobbiton: 'Hobbiton, Matamata, New Zealand',
    thehobbit: 'Hobbiton, Matamata, New Zealand',
    newzealandtravel: 'New Zealand',
    victoria: 'Victoria, Australia',
  };
  const hashtagSource = (typeof fullTextForHashtags === 'string' ? fullTextForHashtags : '') || description;
  const hashtags = hashtagSource.match(/#([a-z0-9]+)/gi) || [];
  const specificOverrides = ['tasmania', 'sydney', 'melbourne', 'perth', 'auckland', 'rotorua', 'hobbiton', 'daintreerainforest', 'seattle', 'oregoncoast'];
  const hasSpecific = specificOverrides.some((s) => hashtags.some((t) => t.slice(1).toLowerCase() === s));
  for (const tag of hashtags) {
    const key = tag.slice(1).toLowerCase().replace(/\s/g, '');
    if (!hashtagMap[key]) continue;
    if (hasSpecific && (key === 'australia' || key === 'travelaustralia' || key === 'newzealand')) continue;
    if (!results.some((r) => r.raw.toLowerCase().includes(hashtagMap[key].toLowerCase().split(',')[0]))) {
      results.push({ placeName: hashtagMap[key].split(',')[0].trim(), raw: hashtagMap[key] });
    }
  }

  return results;
}

/** 완전한 주소인지 검사 - 도시명만 있는 경우(서울, Seou 등) 제외 */
export function isCompleteAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const t = addr.trim();
  if (t.length < 12) return false;
  if (/[가-힣]*(?:구|시|군|로|길|동|리|번지)[^\n]*[\d\s\-]/.test(t)) return true;
  if (/\d+[\s\w\.\-]+(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Way|Chome|丁目|番地)/i.test(t)) return true;
  const parts = t.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && t.length >= 15) return true;
  return false;
}

/** Nominatim이 영문 주소를 더 잘 인식하므로 영문 우선 */
function isEnglishAddress(addr) {
  return /[a-zA-Z]/.test(addr) && /(?:ro|gil|gu|si|do|myeon|dong|South Korea)/i.test(addr);
}

/** 여러 텍스트(설명+댓글)에서 최선의 주소 후보 반환 - 영문 주소 우선, 그 다음 상세도 */
export function getBestAddressFromTexts(description, commentTexts = []) {
  const candidates = [];
  const addCandidate = (text) => {
    const addr = extractAddressFromDescription(text);
    if (addr && isCompleteAddress(addr) && !candidates.some((c) => c.addr === addr)) candidates.push({ addr, detail: addr.length });
    const locText = extractLocationTextFromDescription(text);
    if (locText && isCompleteAddress(locText) && !candidates.some((c) => c.addr === locText)) candidates.push({ addr: locText, detail: locText.length });
  };
  if (description) addCandidate(description);
  for (const ct of commentTexts) {
    if (ct && typeof ct === 'string') addCandidate(ct);
  }
  if (candidates.length === 0) return null;
  const hasEnglish = candidates.some((c) => isEnglishAddress(c.addr));
  if (hasEnglish) {
    const en = candidates.filter((c) => isEnglishAddress(c.addr));
    en.sort((a, b) => b.detail - a.detail);
    return en[0].addr;
  }
  candidates.sort((a, b) => b.detail - a.detail);
  return candidates[0].addr;
}

/** 여러 텍스트에서 최선의 locationText (표시용) - 가장 상세한 것 */
export function getBestLocationTextFromTexts(description, commentTexts = []) {
  const candidates = [];
  const add = (text) => {
    const t = extractLocationTextFromDescription(text);
    if (t) candidates.push({ text: t, len: t.length });
  };
  if (description) add(description);
  for (const ct of commentTexts) {
    if (ct && typeof ct === 'string') add(ct);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.len - a.len);
  return candidates[0].text;
}

export async function geocodeAddress(query) {
  if (!query || query.length < 2) return null;

  const tryGeocode = async (q) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
      const res = await safeFetch(url, {
        headers: { 'User-Agent': 'Map-1-Shorts-Location/1.0' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.[0]) return null;
      const { lat, lon, display_name } = data[0];
      return {
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        address: display_name,
        placeName: query,
        place: display_name.split(',')[0]?.trim() || query,
      };
    } catch {
      return null;
    }
  };

  let result = await tryGeocode(query);
  if (result) return result;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = query.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // 한국어 주소 폴백: "경기 안양시..." → "경기도 안양시..."
  if (/^경기\s+[가-힣]/.test(q)) {
    const withDo = q.replace(/^경기\s/, '경기도 ');
    await sleep(1100);
    result = await tryGeocode(withDo);
    if (result) {
      result.address = query;
      result.placeName = query.split(/[\s,]+/).slice(0, 2).join(' ') || query;
      return result;
    }
  }

  // 영문 주소 + South Korea 폴백: "196 Naengcheon-ro, Manan-gu, Anyang-si, Gyeonggi-do, South Korea" → 구/시/도 단위로 단순화
  if (/South Korea|Korea/i.test(q) && /[-]?(?:ro|gil|gu|si|do|myeon|dong)\b/i.test(q)) {
    const parts = q.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const simplified = parts.slice(-4, -1).join(', ') + ', South Korea';
      await sleep(1100);
      result = await tryGeocode(simplified);
      if (result) {
        result.placeName = parts[0] || result.placeName;
        result.address = query;
        return result;
      }
      await sleep(1100);
      const fallback = parts.slice(-3, -1).join(', ') + ', South Korea';
      result = await tryGeocode(fallback);
      if (result) {
        result.placeName = parts[0] || result.placeName;
        result.address = query;
        return result;
      }
    }
  }

  // 한국 유명 지역명 폴백: "30 Myeongdong-gil (Myeongdong Street...)" → "Myeongdong, Seoul, South Korea"
  const krAreaMap = [
    [/myeongdong|명동/i, 'Myeongdong, Seoul'],
    [/noryangjin|노량진/i, 'Noryangjin, Dongjak-gu, Seoul'],
    [/hongdae|홍대/i, 'Hongdae, Seoul'],
    [/itaewon|이태원/i, 'Itaewon, Seoul'],
    [/gangnam|강남/i, 'Gangnam, Seoul'],
    [/insadong|인사동/i, 'Insadong, Seoul'],
    [/dongdaemun|동대문/i, 'Dongdaemun, Seoul'],
  ];
  for (const [re, areaAddr] of krAreaMap) {
    if (re.test(q)) {
      await sleep(1100);
      result = await tryGeocode(areaAddr + ', South Korea');
      if (result) {
        result.placeName = q;
        result.address = q;
        return result;
      }
      break;
    }
  }

  // 서울 구 단위 주소 폴백: "180 Noryangjin-ro, Dongjak-gu, Seoul, Cup Rice Street" → "Noryangjin, Dongjak-gu, Seoul, South Korea"
  if (/\b(?:ro|gil)\b.*\b(?:gu|si)\b.*Seoul/i.test(q) && !/South Korea/i.test(q)) {
    const withKr = q.replace(/,?\s*[^,]+$/, '') + ', South Korea';
    await sleep(1100);
    result = await tryGeocode(withKr);
    if (result) {
      result.placeName = q;
      result.address = q;
      return result;
    }
  }

  // 한국 영문 주소 폴백: "8 Hobyeong-ro, Gunnae-myeon, Pocheon-si, Gyeonggi-do" → "Gunnae-myeon, Pocheon-si, Gyeonggi-do, South Korea"
  if (/[-]?(?:ro|gil|gu|si|do|myeon|dong|ri)\b/i.test(q) && !/South Korea|Korea|대한민국/i.test(q)) {
    const parts = q.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const simplified = parts.slice(-3).join(', ') + ', South Korea';
      await sleep(1100);
      result = await tryGeocode(simplified);
      if (result) {
        result.placeName = parts[0] || result.placeName;
        result.address = q;
        return result;
      }
      await sleep(1100);
      const fallback = parts.slice(-2).join(', ') + ', South Korea';
      result = await tryGeocode(fallback);
      if (result) {
        result.placeName = parts[0] || result.placeName;
        result.address = q;
        return result;
      }
    }
  }

  return null;
}

/** 좌표 → 주소 (역지오코딩) */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Map-1-Shorts-Location/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const display_name = data?.display_name;
    if (!display_name) return null;
    return {
      address: display_name,
      place: display_name.split(',')[0]?.trim(),
    };
  } catch (e) {
    return null;
  }
}

/** 제목+설명 키워드로 장소 추론 (설명/댓글에서 주소 못 찾을 때 폴백) */
const PLACE_KEYWORDS = [
  { keywords: ['gordon ramsay', 'burger', 'planet hollywood'], lat: 36.0931, lng: -115.1750, place: '라스베가스', placeName: 'Gordon Ramsay Burger', address: '3667 S Las Vegas Blvd, Planet Hollywood, Las Vegas, NV 89109, USA' },
  { keywords: ['lake como', 'como italy', 'lago di como'], lat: 45.9918, lng: 9.2649, place: 'Lake Como', placeName: 'Lake Como', address: 'Lago di Como, Como, Lombardia, Italia' },
  { keywords: ['jensen huang', 'ces las vegas', 'las vegas convention'], lat: 36.1298, lng: -115.1539, place: '라스베가스', placeName: 'Las Vegas Convention Center', address: '3150 Paradise Rd, Las Vegas, NV 89109, USA' },
  { keywords: ['las vegas', 'mandalay', '룸서비스', 'room service'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Mandalay Bay', address: '3950 S Las Vegas Blvd, Las Vegas, NV 89119, USA' },
  { keywords: ['las vegas'], lat: 36.0925, lng: -115.1766, place: '라스베가스', placeName: 'Las Vegas', address: 'Las Vegas, NV, USA' },
  { keywords: ['frank pepe', "pepe's", 'wooster st', 'new haven', 'pizza capital'], lat: 41.30296, lng: -72.91693, place: '뉴헤이븐', placeName: "Frank Pepe's Pizza", address: '157 Wooster St, New Haven, CT 06511, USA' },
  { keywords: ['hunter mountain', 'ski resort', 'upstate', 'new york ski'], lat: 42.2049, lng: -74.2332, place: '뉴욕 업스테이트', placeName: 'Hunter Mountain', address: 'Hunter, NY 12442, USA' },
  { keywords: ['tim ho wan', 'dim sum', '홍콩', 'hong kong'], lat: 22.3193, lng: 114.1694, place: '홍콩', placeName: 'Tim Ho Wan', address: 'Hong Kong' },
  { keywords: ['sushi sho', 'new york'], lat: 40.7484, lng: -73.9857, place: '뉴욕 맨해튼', placeName: 'Sushi Sho', address: 'New York, NY, USA' },
  { keywords: ['tesla', 'self-driving', 'fsd', '샌프란시스코', 'san francisco'], lat: 37.7749, lng: -122.4194, place: '샌프란시스코', placeName: 'San Francisco', address: 'San Francisco, CA, USA' },
  { keywords: ['gyukatsu', '규카츠', '도쿄', 'tokyo', 'japan'], lat: 35.6762, lng: 139.6503, place: '도쿄', placeName: 'Tokyo', address: 'Tokyo, Japan' },
  { keywords: ['gwanghwamun', '광화문'], lat: 37.5720, lng: 126.9794, place: '서울 광화문', placeName: 'Gwanghwamun', address: '서울특별시 종로구 세종대로' },
  { keywords: ['myeongdong', '명동', 'myeongdong-gil', 'myeongdong street'], lat: 37.5604, lng: 126.9853, place: '서울 명동', placeName: 'Myeongdong', address: 'Myeongdong, Jung-gu, Seoul, South Korea' },
  { keywords: ['명화라이브올', '명화라이브홀', 'mh live hall', 'mhlivehall'], lat: 37.5258572, lng: 126.9090433, place: '명화라이브올', placeName: '명화라이브올', address: '서울특별시 영등포구 버드나루로 30' },
  { keywords: ['bryant park'], lat: 40.7542, lng: -73.9848, place: '뉴욕 맨해튼', placeName: 'Bryant Park', address: '40th-42nd St, New York, NY 10018' },
  { keywords: ['white house', 'old ebbitt', '워싱턴', 'washington dc'], lat: 38.8977, lng: -77.0365, place: '워싱턴 DC', placeName: 'Washington DC', address: 'Washington, DC, USA' },
  { keywords: ['koreatown', '코리아타운', '32nd st', 'w 32nd'], lat: 40.7478, lng: -73.9869, place: '뉴욕 코리아타운', placeName: 'Koreatown', address: 'W 32nd St, New York, NY 10001' },
  { keywords: ['street food', 'hot dog', '길바닥'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['disney world', 'walt disney', 'magic kingdom', 'epcot', 'park hopping', 'disney parks'], lat: 28.384151, lng: -81.565246, place: 'Walt Disney World', placeName: 'Walt Disney World', address: 'Lake Buena Vista, Florida, USA' },
  { keywords: ['rogers stadium', 'north york', 'downsview', 'coldplay toronto'], lat: 43.74278, lng: -79.46556, place: 'Rogers Stadium', placeName: 'Rogers Stadium', address: '105 Carl Hall Rd, North York, Toronto, ON, Canada' },
  { keywords: ['lobster', 'new york'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['hospital', 'new york'], lat: 40.7128, lng: -74.006, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['new york', 'nyc', '뉴욕', 'manhattan'], lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' },
  { keywords: ['american', 'steak', 'burger', 'usa', '미국', 'american food', 'american-style', 'american diet'], lat: 40.7128, lng: -74.006, place: '미국', placeName: 'USA', address: 'USA' },
  { keywords: ['austin', 'texas'], lat: 30.2711, lng: -97.7437, place: 'Austin', placeName: 'Austin', address: 'Austin, TX, USA' },
  { keywords: ['coffs harbour', 'coffs harbor', 'big banana', 'the big banana'], lat: -30.2748, lng: 153.1339, place: 'Coffs Harbour', placeName: 'The Big Banana', address: 'The Big Banana, Coffs Harbour, NSW, Australia' },
  { keywords: ['bald head trail', 'albany wa', 'albany western australia'], lat: -35.0927, lng: 117.9966, place: 'Bald Head Trail', placeName: 'Bald Head Trail, Albany WA', address: 'Bald Head Trail, Albany, Western Australia' },
  { keywords: ['seattle', 'visitseattle', 'seattlewashington'], lat: 47.6062, lng: -122.3321, place: 'Seattle', placeName: 'Seattle', address: 'Seattle, WA, USA' },
  { keywords: ['oregon', 'oregoncoast'], lat: 44.5588, lng: -124.0665, place: 'Oregon Coast', placeName: 'Oregon Coast', address: 'Oregon Coast, OR, USA' },
  { keywords: ['daintree', 'daintreerainforest'], lat: -16.2500, lng: 145.4167, place: 'Daintree Rainforest', placeName: 'Daintree Rainforest', address: 'Daintree, Queensland, Australia' },
  { keywords: ['hobbiton', 'thehobbit'], lat: -37.8720, lng: 175.6830, place: 'Hobbiton', placeName: 'Hobbiton', address: 'Matamata, New Zealand' },
  { keywords: ['rotorua'], lat: -38.1368, lng: 176.2492, place: 'Rotorua', placeName: 'Rotorua', address: 'Rotorua, New Zealand' },
  { keywords: ['auckland', 'new zealand'], lat: -36.8509, lng: 174.7645, place: 'Auckland', placeName: 'Auckland', address: 'Auckland, New Zealand' },
  { keywords: ['esperance', 'perth australia'], lat: -33.8612, lng: 121.8917, place: 'Esperance', placeName: 'Esperance', address: 'Esperance, Western Australia' },
  { keywords: ['tasmania'], lat: -42.0378, lng: 146.6367, place: 'Tasmania', placeName: 'Tasmania', address: 'Tasmania, Australia' },
  { keywords: ['wallaman', 'tallest waterfall', 'tallest waterfall in australia'], lat: -18.5975, lng: 145.8039, place: 'Wallaman Falls', placeName: 'Wallaman Falls', address: 'Wallaman Falls, Queensland, Australia' },
  { keywords: ['paronella', 'spanish castle australia'], lat: -17.5667, lng: 145.8833, place: 'Paronella Park', placeName: 'Paronella Park', address: 'Paronella Park, Queensland, Australia' },
  { keywords: ['via ferrata', 'australia'], lat: -37.8142, lng: 144.9632, place: 'Melbourne', placeName: 'Via Ferrata Australia', address: 'Victoria, Australia' },
  { keywords: ['올림픽스타디움', '잠실올림픽', 'olympic stadium', 'jamsil'], lat: 37.5163, lng: 127.0729, place: '서울 올림픽스타디움', placeName: '서울올림픽주경기장', address: '서울특별시 송파구 올림픽로 25' },
  { keywords: ['고척스카이돔', '고척돔', 'gocheok sky dome'], lat: 37.4988, lng: 126.8670, place: '고척스카이돔', placeName: '고척스카이돔', address: '서울특별시 구로구 경인로 430' },
  { keywords: ['kspo돔', 'kspo dome', '올림픽체조경기장'], lat: 37.5211, lng: 127.1245, place: 'KSPO돔', placeName: 'KSPO돔', address: '서울특별시 송파구 올림픽로 424' },
  { keywords: ['인천문학', '문학경기장', '인천문학경기장'], lat: 37.4362, lng: 126.6930, place: '인천문학경기장', placeName: '인천문학경기장', address: '인천광역시 미추홀구 매소홀로 618' },
  { keywords: ['부산아시아드', '부산아시아드주경기장'], lat: 35.1664, lng: 129.0615, place: '부산아시아드주경기장', placeName: '부산아시아드주경기장', address: '부산광역시 연제구 월드컵대로 123' },
  { keywords: ['광주기아챔피언스필드', '광주챔피언스필드'], lat: 35.1681, lng: 126.8890, place: '광주기아챔피언스필드', placeName: '광주기아챔피언스필드', address: '광주광역시 북구 오룡동' },
  { keywords: ['대구삼성라이온즈파크', '대구삼성'], lat: 35.8414, lng: 128.6814, place: '대구삼성라이온즈파크', placeName: '대구삼성라이온즈파크', address: '대구광역시 수성구 야구전설로 1' },
];

export function inferPlaceFromKeywords(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  for (const p of PLACE_KEYWORDS) {
    if (p.keywords.some((k) => text.includes(k))) return p;
  }
  if (text.includes('new york') || text.includes('nyc') || text.includes('뉴욕')) {
    return { lat: 40.7478, lng: -73.9869, place: '뉴욕', placeName: 'New York', address: 'New York, NY, USA' };
  }
  return null;
}
