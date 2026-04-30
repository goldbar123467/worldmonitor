const REGIONS = [
  { name: "The West",      hint: "Mountains, deserts, the Pacific. Try CA, UT, CO, AZ, WA." },
  { name: "The South",     hint: "Beaches, bayous, BBQ. Try FL, GA, LA, TN, SC." },
  { name: "The Northeast", hint: "Cities and shorelines. Try NY, MA, PA, ME, DC." },
  { name: "The Midwest",   hint: "Great Lakes and prairies. Try IL, MI, MN, OH, WI." }
];

function rollRegion() {
  const pick = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const out = document.getElementById('rouletteResult');
  out.innerHTML = `
    <div class="result-card">
      ★ ${pick.name} ★
      <div class="result-hint">${pick.hint}</div>
    </div>
  `;
}
