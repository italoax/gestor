window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initPhoneFields = function ({ on }) {
  const phonePrefixes = [
    ['+93', 'Afeganistão'],
    ['+355', 'Albânia'],
    ['+213', 'Argélia'],
    ['+1684', 'Samoa Americana'],
    ['+376', 'Andorra'],
    ['+244', 'Angola'],
    ['+1264', 'Anguilla'],
    ['+1268', 'Antígua e Barbuda'],
    ['+54', 'Argentina'],
    ['+374', 'Armênia'],
    ['+297', 'Aruba'],
    ['+61', 'Austrália'],
    ['+43', 'Áustria'],
    ['+994', 'Azerbaijão'],
    ['+1242', 'Bahamas'],
    ['+973', 'Bahrein'],
    ['+880', 'Bangladesh'],
    ['+1246', 'Barbados'],
    ['+375', 'Belarus'],
    ['+32', 'Bélgica'],
    ['+501', 'Belize'],
    ['+229', 'Benin'],
    ['+1441', 'Bermudas'],
    ['+975', 'Butão'],
    ['+591', 'Bolívia'],
    ['+387', 'Bósnia e Herzegovina'],
    ['+267', 'Botsuana'],
    ['+55', 'Brasil'],
    ['+246', 'Território Britânico do Oceano Índico'],
    ['+673', 'Brunei'],
    ['+359', 'Bulgária'],
    ['+226', 'Burkina Faso'],
    ['+257', 'Burundi'],
    ['+855', 'Camboja'],
    ['+237', 'Camarões'],
    ['+1', 'Canadá / Estados Unidos'],
    ['+238', 'Cabo Verde'],
    ['+1345', 'Ilhas Cayman'],
    ['+236', 'República Centro-Africana'],
    ['+235', 'Chade'],
    ['+56', 'Chile'],
    ['+86', 'China'],
    ['+57', 'Colômbia'],
    ['+269', 'Comores'],
    ['+242', 'Congo'],
    ['+243', 'República Democrática do Congo'],
    ['+682', 'Ilhas Cook'],
    ['+506', 'Costa Rica'],
    ['+225', 'Costa do Marfim'],
    ['+385', 'Croácia'],
    ['+53', 'Cuba'],
    ['+599', 'Curaçao / Caribe Neerlandês'],
    ['+357', 'Chipre'],
    ['+420', 'Tchéquia'],
    ['+45', 'Dinamarca'],
    ['+253', 'Djibuti'],
    ['+1767', 'Dominica'],
    ['+1809', 'República Dominicana'],
    ['+1829', 'República Dominicana'],
    ['+1849', 'República Dominicana'],
    ['+593', 'Equador'],
    ['+20', 'Egito'],
    ['+503', 'El Salvador'],
    ['+240', 'Guiné Equatorial'],
    ['+291', 'Eritreia'],
    ['+372', 'Estônia'],
    ['+268', 'Essuatíni'],
    ['+251', 'Etiópia'],
    ['+500', 'Ilhas Malvinas'],
    ['+298', 'Ilhas Faroe'],
    ['+679', 'Fiji'],
    ['+358', 'Finlândia'],
    ['+33', 'França'],
    ['+594', 'Guiana Francesa'],
    ['+689', 'Polinésia Francesa'],
    ['+241', 'Gabão'],
    ['+220', 'Gâmbia'],
    ['+995', 'Geórgia'],
    ['+49', 'Alemanha'],
    ['+233', 'Gana'],
    ['+350', 'Gibraltar'],
    ['+30', 'Grécia'],
    ['+299', 'Groenlândia'],
    ['+1473', 'Granada'],
    ['+590', 'Guadalupe / São Bartolomeu / São Martinho'],
    ['+1671', 'Guam'],
    ['+502', 'Guatemala'],
    ['+44', 'Reino Unido / Guernsey / Ilha de Man / Jersey'],
    ['+224', 'Guiné'],
    ['+245', 'Guiné-Bissau'],
    ['+592', 'Guiana'],
    ['+509', 'Haiti'],
    ['+504', 'Honduras'],
    ['+852', 'Hong Kong'],
    ['+36', 'Hungria'],
    ['+354', 'Islândia'],
    ['+91', 'Índia'],
    ['+62', 'Indonésia'],
    ['+98', 'Irã'],
    ['+964', 'Iraque'],
    ['+353', 'Irlanda'],
    ['+972', 'Israel'],
    ['+39', 'Itália / Vaticano'],
    ['+1876', 'Jamaica'],
    ['+81', 'Japão'],
    ['+962', 'Jordânia'],
    ['+7', 'Rússia / Cazaquistão'],
    ['+254', 'Quênia'],
    ['+686', 'Kiribati'],
    ['+850', 'Coreia do Norte'],
    ['+82', 'Coreia do Sul'],
    ['+965', 'Kuwait'],
    ['+996', 'Quirguistão'],
    ['+856', 'Laos'],
    ['+371', 'Letônia'],
    ['+961', 'Líbano'],
    ['+266', 'Lesoto'],
    ['+231', 'Libéria'],
    ['+218', 'Líbia'],
    ['+423', 'Liechtenstein'],
    ['+370', 'Lituânia'],
    ['+352', 'Luxemburgo'],
    ['+853', 'Macau'],
    ['+261', 'Madagascar'],
    ['+265', 'Malawi'],
    ['+60', 'Malásia'],
    ['+960', 'Maldivas'],
    ['+223', 'Mali'],
    ['+356', 'Malta'],
    ['+692', 'Ilhas Marshall'],
    ['+596', 'Martinica'],
    ['+222', 'Mauritânia'],
    ['+230', 'Maurício'],
    ['+262', 'Mayotte / Reunião'],
    ['+52', 'México'],
    ['+691', 'Micronésia'],
    ['+373', 'Moldávia'],
    ['+377', 'Mônaco'],
    ['+976', 'Mongólia'],
    ['+382', 'Montenegro'],
    ['+1664', 'Montserrat'],
    ['+212', 'Marrocos'],
    ['+258', 'Moçambique'],
    ['+95', 'Myanmar'],
    ['+264', 'Namíbia'],
    ['+674', 'Nauru'],
    ['+977', 'Nepal'],
    ['+31', 'Países Baixos'],
    ['+687', 'Nova Caledônia'],
    ['+64', 'Nova Zelândia'],
    ['+505', 'Nicarágua'],
    ['+227', 'Níger'],
    ['+234', 'Nigéria'],
    ['+683', 'Niue'],
    ['+672', 'Norfolk / Antártida Australiana'],
    ['+389', 'Macedônia do Norte'],
    ['+1670', 'Ilhas Marianas do Norte'],
    ['+47', 'Noruega / Svalbard'],
    ['+968', 'Omã'],
    ['+92', 'Paquistão'],
    ['+680', 'Palau'],
    ['+970', 'Palestina'],
    ['+507', 'Panamá'],
    ['+675', 'Papua-Nova Guiné'],
    ['+595', 'Paraguai'],
    ['+51', 'Peru'],
    ['+63', 'Filipinas'],
    ['+48', 'Polônia'],
    ['+351', 'Portugal'],
    ['+1787', 'Porto Rico'],
    ['+1939', 'Porto Rico'],
    ['+974', 'Catar'],
    ['+40', 'Romênia'],
    ['+250', 'Ruanda'],
    ['+290', 'Santa Helena'],
    ['+1869', 'São Cristóvão e Névis'],
    ['+1758', 'Santa Lúcia'],
    ['+508', 'Saint Pierre e Miquelon'],
    ['+1784', 'São Vicente e Granadinas'],
    ['+685', 'Samoa'],
    ['+378', 'San Marino'],
    ['+239', 'São Tomé e Príncipe'],
    ['+966', 'Arábia Saudita'],
    ['+221', 'Senegal'],
    ['+381', 'Sérvia'],
    ['+248', 'Seychelles'],
    ['+232', 'Serra Leoa'],
    ['+65', 'Singapura'],
    ['+421', 'Eslováquia'],
    ['+386', 'Eslovênia'],
    ['+677', 'Ilhas Salomão'],
    ['+252', 'Somália'],
    ['+27', 'África do Sul'],
    ['+211', 'Sudão do Sul'],
    ['+34', 'Espanha'],
    ['+94', 'Sri Lanka'],
    ['+249', 'Sudão'],
    ['+597', 'Suriname'],
    ['+46', 'Suécia'],
    ['+41', 'Suíça'],
    ['+963', 'Síria'],
    ['+886', 'Taiwan'],
    ['+992', 'Tajiquistão'],
    ['+255', 'Tanzânia'],
    ['+66', 'Tailândia'],
    ['+670', 'Timor-Leste'],
    ['+228', 'Togo'],
    ['+690', 'Tokelau'],
    ['+676', 'Tonga'],
    ['+1868', 'Trinidad e Tobago'],
    ['+216', 'Tunísia'],
    ['+90', 'Turquia'],
    ['+993', 'Turcomenistão'],
    ['+1649', 'Turks e Caicos'],
    ['+688', 'Tuvalu'],
    ['+256', 'Uganda'],
    ['+380', 'Ucrânia'],
    ['+971', 'Emirados Árabes Unidos'],
    ['+598', 'Uruguai'],
    ['+998', 'Uzbequistão'],
    ['+678', 'Vanuatu'],
    ['+58', 'Venezuela'],
    ['+84', 'Vietnã'],
    ['+1284', 'Ilhas Virgens Britânicas'],
    ['+1340', 'Ilhas Virgens Americanas'],
    ['+681', 'Wallis e Futuna'],
    ['+967', 'Iêmen'],
    ['+260', 'Zâmbia'],
    ['+263', 'Zimbábue'],
  ];

  const normalizePrefixValue = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    return digits ? '+' + digits : '+55';
  };

  const findPrefixFromPhone = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    const sorted = phonePrefixes
      .map((item) => item[0])
      .sort((a, b) => b.length - a.length);
    return (
      sorted.find((prefix) => digits.startsWith(prefix.replace(/\D+/g, ''))) ||
      '+55'
    );
  };

  const setPhonePrefix = (box, prefix) => {
    if (!box) return;
    const normalized = normalizePrefixValue(prefix);
    const btn = box.querySelector('[data-phone-prefix-toggle]');
    const input = box.querySelector('[data-phone-prefix-value]');
    if (btn) btn.textContent = normalized;
    if (input) input.value = normalized;
  };

  const getPhonePrefix = (input) => {
    const box =
      input && input.closest('.phone-control')
        ? input.closest('.phone-control').querySelector('[data-phone-prefix]')
        : null;
    const value = box ? box.querySelector('[data-phone-prefix-value]') : null;
    return normalizePrefixValue(value ? value.value : '+55');
  };

  const stripPhonePrefix = (value, prefix) => {
    let digits = String(value || '').replace(/\D+/g, '');
    const prefixDigits = normalizePrefixValue(prefix).replace(/\D+/g, '');
    if (digits.startsWith(prefixDigits) && digits.length > prefixDigits.length)
      digits = digits.slice(prefixDigits.length);
    return digits;
  };

  const formatPhoneValue = (value, prefix = '+55') => {
    let digits = stripPhonePrefix(value, prefix);
    if (normalizePrefixValue(prefix) !== '+55') {
      digits = digits.slice(0, 15);
      return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    }
    digits = digits.slice(0, 11);
    if (digits.length <= 2) return digits ? '(' + digits : '';
    if (digits.length <= 6)
      return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
    if (digits.length <= 10)
      return (
        '(' +
        digits.slice(0, 2) +
        ') ' +
        digits.slice(2, 6) +
        '-' +
        digits.slice(6)
      );
    return (
      '(' +
      digits.slice(0, 2) +
      ') ' +
      digits.slice(2, 7) +
      '-' +
      digits.slice(7)
    );
  };

  const formatPhoneInput = (input) => {
    if (!input) return;
    input.value = formatPhoneValue(input.value, getPhonePrefix(input));
  };

  const initPhonePrefixSelect = () => {
    document.querySelectorAll('[data-phone-prefix]').forEach((box) => {
      const btn = box.querySelector('[data-phone-prefix-toggle]');
      const hidden = box.querySelector('[data-phone-prefix-value]');
      const menu = box.querySelector('.phone-prefix-menu');
      const search = box.querySelector('[data-phone-prefix-search]');
      const list = box.querySelector('[data-phone-prefix-list]');
      const phoneInput = box.closest('.phone-control')
        ? box.closest('.phone-control').querySelector('[data-phone-mask]')
        : null;
      if (!btn || !hidden || !menu || !list) return;

      const closeMenu = () => {
        box.classList.remove('open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      };
      const render = (term = '') => {
        const normalized = term
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        list.innerHTML = '';
        phonePrefixes
          .filter(([prefix, country]) =>
            (prefix + ' ' + country)
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .includes(normalized),
          )
          .forEach(([prefix, country]) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className =
              'phone-prefix-option' +
              (hidden.value === prefix ? ' active' : '');
            option.innerHTML =
              '<strong>' +
              prefix +
              '</strong><span class="phone-prefix-country">' +
              country +
              '</span>';
            option.addEventListener('click', () => {
              const oldPrefix = hidden.value;
              setPhonePrefix(box, prefix);
              if (phoneInput && oldPrefix !== prefix)
                formatPhoneInput(phoneInput);
              closeMenu();
            });
            list.appendChild(option);
          });
      };

      setPhonePrefix(box, hidden.value || '+55');
      render();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = menu.hidden;
        document
          .querySelectorAll('[data-phone-prefix] .phone-prefix-menu')
          .forEach((other) => {
            other.hidden = true;
          });
        document
          .querySelectorAll('[data-phone-prefix]')
          .forEach((other) => other.classList.remove('open'));
        menu.hidden = !open;
        box.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          render(search ? search.value : '');
          if (search) search.focus();
        }
      });
      if (search) search.addEventListener('input', () => render(search.value));
      on(document, 'click', (e) => {
        if (!box.contains(e.target)) closeMenu();
      });
    });
  };

  initPhonePrefixSelect();

  document.querySelectorAll('[data-phone-mask]').forEach((input) => {
    formatPhoneInput(input);
    input.addEventListener('input', () => formatPhoneInput(input));
    input.addEventListener('paste', () =>
      setTimeout(() => formatPhoneInput(input), 0),
    );
  });

  return {
    findPrefixFromPhone,
    setPhonePrefix,
    stripPhonePrefix,
    formatPhoneInput,
  };
};
