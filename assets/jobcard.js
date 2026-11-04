/* job-card.niveshsahayak.in: repair job card (what came in, the complaint, estimate, status) and the service bill for the
   same job (parts at their GST rate, labour as a repair service). Record type 'job'; it counts as a sale in the Nivesh Sahayak App
   once it is printed or saved as a service bill (print 'bill'). */
(function () {
  'use strict';
  var $ = NS.$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var STAT = ['recd', 'work', 'parts', 'ready', 'done'];
  var STATP = { recd: 'Received', work: 'In progress', parts: 'Waiting for parts', ready: 'Ready for delivery', done: 'Delivered' };
  var K;
  function row(kind) { return { kind: kind || 'part', desc: '', hsn: kind === 'lab' ? '9987' : '', qty: 1, rate: '', disc: '', gst: kind === 'lab' ? 18 : 18, unit: kind === 'lab' ? 'Job' : 'Nos' }; }
  function taxOn(d) { return d.kind === 'tax'; }
  function sums(d) {
    var tax = taxOn(d), o = { rows: [], parts: 0, lab: 0, taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0 };
    o.intra = !d.buyer.state || !d.seller.state || d.buyer.state === d.seller.state;
    d.items.forEach(function (it) {
      var q = num(it.qty), r = num(it.rate); if (!it.desc && !r) return;
      var v = r2(q * r - q * r * num(it.disc) / 100), g = tax ? num(it.gst) : 0, tx = r2(v * g / 100);
      o.rows.push({ it: it, value: v, g: g, tax: tx }); o[it.kind === 'lab' ? 'lab' : 'parts'] += v; o.taxable += v; o.tax += tx;
    });
    o.parts = r2(o.parts); o.lab = r2(o.lab); o.taxable = r2(o.taxable); o.tax = r2(o.tax);
    if (o.intra) { o.cgst = r2(o.tax / 2); o.sgst = r2(o.tax - o.cgst); } else o.igst = o.tax;
    var total = r2(o.taxable + o.tax); o.roundOff = r2(Math.round(total) - total); o.total = r2(total + o.roundOff);
    o.adv = num(d.adv); o.due = d.status2 === 'paid' ? 0 : r2(o.total - o.adv);
    return o;
  }
  function kindFor(s) { return s.reg === 'comp' ? 'supply' : s.gstin && s.reg !== 'unreg' ? 'tax' : 'plain'; }
  function board() {
    var who = String(K.doc().seller.name || '').trim().toLowerCase(), dlg = $('#jc-board');
    NSStore.list('doc').then(function (all) {
      var jobs = all.filter(function (x) { return x.type === 'job' && x.jstat !== 'done' && String(x.seller && x.seller.name || '').trim().toLowerCase() === who; })
        .sort(function (a, b) { return (a.promise || '9').localeCompare(b.promise || '9'); });
      $('[data-board]', dlg).innerHTML = jobs.length ? '<table class="day"><thead><tr><th>' + esc(t('jc.no')) + '</th><th>' + esc(t('jc.item')) + '</th><th>' + esc(t('jc.status')) + '</th><th>' + esc(t('jc.promise')) + '</th><th></th></tr></thead><tbody>' + jobs.map(function (x) {
        var late = x.promise && x.promise < NS.today();
        return '<tr' + (late ? ' class="warn"' : '') + '><td class="mono">' + esc(x.no) + '</td><td>' + esc([x.make, x.model].filter(Boolean).join(' ')) + '<br><small>' + esc(x.buyer && x.buyer.name || '') + '</small></td><td>' + esc(t('jc.s.' + (x.jstat || 'recd'))) + '</td><td>' + (x.promise ? NS.fmtDate(x.promise) : '') + '</td><td><button type="button" class="btn sm" data-open="' + x.id + '">' + esc(t('h.open')) + '</button></td></tr>';
      }).join('') + '</tbody></table>' : '<p>' + esc(t('jc.nojobs')) + '</p>';
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    });
  }
  function waText(d, o) {
    var item = [d.make, d.model].filter(Boolean).join(' ') || 'item';
    return d.jstat === 'ready' ? 'Hello ' + (d.buyer.name || '') + ', your ' + item + ' (job ' + d.no + ') is ready for pickup.' + (o.total ? ' Bill amount ' + NS.money(o.total) + (o.due && o.due !== o.total ? ', balance ' + NS.money(o.due) : '') + '.' : '') + ' ' + (d.seller.name || '')
      : 'Hello ' + (d.buyer.name || '') + ', we have received your ' + item + ' (job ' + d.no + ').' + (num(d.est) ? ' Estimate ' + NS.money(num(d.est)) + '.' : '') + (d.promise ? ' Expected by ' + NS.fmtDate(d.promise) + '.' : '') + ' ' + (d.seller.name || '');
  }

  K = NS.kit({
    type: 'job', prefix: 'JC', digits: 4, paper: 'a5', papers: ['a5', 'a4', 'th80'], copies: 2, copyLabels: ['Customer copy', 'Workshop copy'],
    name: function (d) { return d.print === 'bill' ? 'Service Bill' : 'Job Card'; },
    blank: function () { return { print: 'card', jstat: 'recd', itype: 'vehicle', make: '', model: '', serial: '', odo: '', acc: '', cond: '', complaint: '', est: '', promise: '', tech: '', kind: 'plain', adv: '', status2: 'unpaid', payMode: 'cash', terms: 'Estimate is approximate; we will call before extra work. Items not collected within 30 days of the ready message are at the owner’s risk.', items: [row('lab')] }; },
    newRow: function () { return row('part'); },
    keepOnNew: function (d) { return { itype: d.itype, kind: d.kind, paper: d.paper, terms: d.terms }; },
    form: function (K) {
      return K.card(t('jc.cust'), '<div class="fg">' + K.f('buyer.name', t('l.cname'), { wide: true }) + K.f('buyer.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
          K.f('buyer.addr', t('l.addr'), { type: 'textarea', wide: true }) + K.f('buyer.gstin', t('l.cgstin'), { max: 15, ltr: 1 }) + K.f('buyer.state', t('l.state'), { type: 'select', opts: K.states() }) + '</div>') +
        K.card(t('jc.item'), '<div class="fg">' +
          K.f('itype', t('jc.itype'), { type: 'select', opts: [['vehicle', t('jc.t.vehicle')], ['mobile', t('jc.t.mobile')], ['appliance', t('jc.t.appliance')], ['computer', t('jc.t.computer')], ['other', t('jc.t.other')]] }) +
          K.f('make', t('jc.make')) + K.f('model', t('jc.model')) + K.f('serial', t('jc.serial'), { ltr: 1 }) + K.f('odo', t('jc.odo'), { mode: 'numeric', ltr: 1, show: 'itype=vehicle' }) +
          K.f('acc', t('jc.acc'), { wide: true, ph: t('jc.accph') }) + K.f('cond', t('jc.cond'), { type: 'textarea', wide: true, ph: t('jc.condph') }) +
          K.f('complaint', t('jc.complaint'), { type: 'textarea', wide: true }) + '</div>') +
        K.numCard(K.f('jstat', t('jc.status'), { type: 'select', opts: STAT.map(function (s) { return [s, t('jc.s.' + s)]; }) }) + K.f('promise', t('jc.promise'), { type: 'date' }) +
          K.f('est', t('jc.est'), { mode: 'decimal', ltr: 1 }) + K.f('tech', t('jc.tech')) +
          K.f('print', t('lr.print'), { type: 'select', opts: [['card', t('jc.pcard')], ['bill', t('jc.pbill')]], wide: true, hint: t('jc.printh') }), t('jc.lgjob')) +
        K.card(t('jc.work'), K.list('items', t('jc.addline')) + '<div class="fg">' +
          K.f('kind', t('pos.kind'), { type: 'select', wide: true, opts: [['tax', t('k.tax')], ['supply', t('k.supply')], ['plain', t('k.plain')]] }) +
          K.f('adv', t('lr.adv'), { mode: 'decimal', ltr: 1 }) + K.f('status2', t('l.pay'), { type: 'select', opts: [['unpaid', t('pay.unpaid')], ['paid', t('pay.paid')]] }) +
          K.f('payMode', t('pos.mode'), { type: 'select', opts: K.modes(['cash', 'upi', 'card', 'bank']), show: 'status2=paid' }) +
          '<div class="sums wide" id="ed-sums" aria-live="polite"></div>' +
          '<div class="row wide pos-go"><button type="button" class="btn" data-jc="wa">' + esc(t('jc.wa')) + '</button><button type="button" class="btn" data-jc="board">' + esc(t('jc.board')) + '</button></div></div>') +
        K.bizCard({}) + K.lookCard(K.f('terms', t('l.terms'), { type: 'textarea', wide: true })) +
        '<datalist id="dl-rates"><option value="0"><option value="5"><option value="18"><option value="40"></datalist>';
    },
    rows: {
      items: function (it, i, K) {
        return K.rf('items', i, 'kind', t('jc.lk'), { type: 'select', opts: [['part', t('jc.part')], ['lab', t('jc.lab')]] }) + K.rf('items', i, 'desc', t('l.desc'), { cls: 'it-d', sug: 'item' }) +
          K.rf('items', i, 'qty', t('l.qty'), { mode: 'decimal', ltr: 1 }) + K.rf('items', i, 'rate', t('l.rate'), { mode: 'decimal', ltr: 1 }) +
          (taxOn(K.doc()) ? K.rf('items', i, 'gst', t('l.gst'), { mode: 'decimal', ltr: 1, list: 'dl-rates' }) + K.rf('items', i, 'hsn', t('l.hsn'), { mode: 'numeric', max: 8, ltr: 1 }) : '');
      }
    },
    rowInput: function (n, i, k, d) { var it = d.items[i]; if (k === 'kind' && it.kind === 'lab') { if (!it.hsn) it.hsn = '9987'; it.unit = 'Job'; K.refill(); } },
    input: function (p, el, d, K) {
      if (p === 'kind') K.refill();
      if ((p === 'seller.gstin' || p === 'seller.name') && !K.editing()) { var k = kindFor(d.seller); if (k !== d.kind) { d.kind = k; K.refill(); } }
      if (p === 'jstat' && d.jstat === 'done' && d.print !== 'bill') { d.print = 'bill'; K.refill(); }
    },
    sums: sums,
    edSums: function (d, o) {
      return '<span>' + esc(t('jc.sum.parts', { v: NS.money(o.parts) })) + '</span><span>' + esc(t('jc.sum.lab', { v: NS.money(o.lab) })) + '</span>' + (o.tax ? '<span>' + esc(t('sum.gst', { v: NS.money(o.tax) })) + '</span>' : '') +
        '<b>' + esc(t('sum.total', { v: NS.money(o.total) })) + '</b>' + (o.due && o.total ? '<span>' + esc(t('lr.s.due', { v: NS.money(o.due) })) + '</span>' : '') +
        (num(d.est) && o.total > num(d.est) * 1.1 ? '<span class="warn">' + esc(t('jc.over', { v: NS.money(num(d.est)) })) + '</span>' : '');
    },
    validate: function (d, o) {
      var p = [];
      if (!String(d.buyer.name || '').trim()) p.push(['k-buyer-name', t('jc.v.cust')]);
      if (!String(d.make || d.model || d.serial).trim()) p.push(['k-make', t('jc.v.item')]);
      if (d.print === 'bill' && !o.rows.length) p.push(['r-items-desc-0', t('v.item')]);
      if (d.kind === 'tax' && !d.seller.gstin) p.push(['k-seller-gstin', t('v.tax')]);
      return p;
    },
    confirm: function (d, o) { return d.status2 === 'paid' && d.payMode === 'cash' && o.total >= 200000 ? t('c.cash2l') : ''; },
    masterItems: function (d) { return d.items.filter(function (it) { return it.desc; }).map(function (it) { return { desc: String(it.desc).trim(), hsn: it.hsn || '', unit: it.unit || '', rate: it.rate, gst: d.kind === 'tax' ? it.gst : '', kind: it.kind === 'lab' ? 'service' : '' }; }); },
    record: function (rec) { rec.items = rec.items.filter(function (it) { return it.desc || num(it.rate); }); rec.withGst = rec.kind === 'tax'; rec.status = rec.status2 === 'paid' ? 'paid' : 'unpaid'; },
    load: function (d) { if (!d.items || !d.items.length) d.items = [row('lab')]; },
    copyOf: function (d) { d.jstat = 'recd'; d.print = 'card'; d.status2 = 'unpaid'; d.adv = ''; d.complaint = ''; d.cond = ''; d.promise = ''; d.items = [row('lab')]; },
    copyLbl: 'jc.again',
    histName: function (d) { return [d.make, d.model].filter(Boolean).join(' ') + ' · ' + (d.buyer && d.buyer.name || ''); },
    histText: function (d) { return [d.serial, d.make, d.model, d.buyer && d.buyer.phone].join(' '); },
    histPill: function (d) { return ' <span class="pill' + (d.jstat === 'done' ? ' ok' : '') + '">' + esc(t('jc.s.' + (d.jstat || 'recd'))) + '</span>'; },
    shareText: function (d, o) { return '\n' + waText(d, o); },
    upiShare: false,
    sheet: function (d, o, K, label) {
      var bill = d.print === 'bill', b = d.buyer, tax = taxOn(d);
      var item = [['Item', esc({ vehicle: 'Vehicle', mobile: 'Mobile phone', appliance: 'Appliance', computer: 'Computer / laptop', other: 'Item' }[d.itype] || 'Item')], ['Make / model', esc([d.make, d.model].filter(Boolean).join(' '))],
        ['Reg. / serial / IMEI', '<span class="mono">' + esc(d.serial) + '</span>'], d.itype === 'vehicle' && d.odo ? ['Odometer', esc(d.odo) + ' km'] : null, d.tech ? ['Technician', esc(d.tech)] : null];
      var meta = [[bill ? 'Bill No.' : 'Job No.', '<span class="mono">' + esc(d.no) + '</span>'], ['Date', NS.fmtDate(d.date)], ['Status', STATP[d.jstat] || ''], d.promise ? ['Promised by', NS.fmtDate(d.promise)] : null].concat(item);
      var title = bill ? (d.kind === 'tax' ? 'TAX INVOICE (SERVICE BILL)' : d.kind === 'supply' ? 'BILL OF SUPPLY (SERVICE BILL)' : 'SERVICE BILL') : 'JOB CARD';
      var head = K.open(d, 'job') + K.head(d, title, label || '') + K.meta(meta) + '<div class="parties">' + K.party(b, 'Customer') + '</div>';
      var intake = (d.complaint ? '<div class="nt"><div><h4>Complaint / work asked</h4><p>' + esc(d.complaint).replace(/\n/g, '<br>') + '</p></div>' + (d.acc || d.cond ? '<div><h4>Received with</h4><p>' + esc(d.acc) + (d.cond ? '<br>Condition: ' + esc(d.cond).replace(/\n/g, '<br>') : '') + '</p></div>' : '') + '</div>' : '');
      var lines = o.rows.length ? '<table class="lines"><thead><tr><th>#</th><th class="l">Parts and labour</th>' + (tax ? '<th>HSN/SAC</th>' : '') + '<th class="n">Qty</th><th class="n">Rate</th><th class="n">' + (tax ? 'Taxable' : 'Amount') + '</th>' + (tax ? '<th class="n">GST</th>' : '') + '</tr></thead><tbody>' +
        o.rows.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(r.it.desc) + ' <small>(' + (r.it.kind === 'lab' ? 'labour' : 'part') + ')</small></td>' + (tax ? '<td class="mono">' + esc(r.it.hsn) + '</td>' : '') + '<td class="n">' + NS.qty(num(r.it.qty)) + '</td><td class="n">' + NS.money(num(r.it.rate), false) + '</td><td class="n">' + NS.money(r.value, false) + '</td>' + (tax ? '<td class="n">' + r.g + '%</td>' : '') + '</tr>'; }).join('') + '</tbody></table>' : '';
      var tot = K.tot([['Parts', NS.money(o.parts)], ['Labour', NS.money(o.lab)], tax && o.intra ? ['CGST', NS.money(o.cgst)] : null, tax && o.intra ? ['SGST', NS.money(o.sgst)] : null, tax && !o.intra ? ['IGST', NS.money(o.igst)] : null,
        o.roundOff ? ['Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))] : null, ['Total', NS.money(o.total), 'grand'], o.adv ? ['Advance received', '−' + NS.money(o.adv)] : null, o.due && o.due !== o.total ? ['Balance due', NS.money(o.due)] : null]);
      if (!bill) {
        return head + intake + (num(d.est) ? '<p class="small"><b>Estimate: ' + NS.money(num(d.est)) + '</b> (approximate)' + (o.adv ? ', advance received ' + NS.money(o.adv) : '') + '</p>' : '') + lines +
          (d.terms ? '<div class="nt"><div><h4>Terms</h4><p>' + esc(d.terms).replace(/\n/g, '<br>') + '</p></div></div>' : '') +
          '<div class="signs">' + K.blankSign('I agree to the terms above.', 'Customer’s signature') + K.sign(d, '', 'Received by (workshop)') + '</div>' + K.made() + '</div>';
      }
      return head + lines + '<div class="foot"><div class="foot-l">' + K.words(o.total) + (d.kind === 'supply' ? '<p class="small">Composition taxable person, not eligible to collect tax on supplies.</p>' : '') +
        (d.complaint ? '<p class="small"><b>Work:</b> ' + esc(d.complaint) + '</p>' : '') + (d.notes ? '<p class="small">' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '') +
        '</div><div class="foot-r">' + tot + (d.status2 !== 'paid' ? K.qr(d, o.due) : '') + '</div></div>' +
        '<div class="signs">' + K.blankSign('Received the item in good condition.', 'Customer’s signature') + K.sign(d) + '</div>' + K.made() + '</div>';
    },
    wire: function (ed) {
      $('[data-jc="board"]', ed).addEventListener('click', board);
      $('[data-jc="wa"]', ed).addEventListener('click', function () {
        var d = K.doc(), ph = String(d.buyer.phone || '').replace(/\D/g, '').slice(-10);
        window.open('https://wa.me/' + (ph.length === 10 ? '91' + ph : '') + '?text=' + encodeURIComponent(waText(d, sums(d))), '_blank', 'noopener');
      });
    },
    ready: function (K) {
      var d = K.doc(); if (!K.editing() && d.seller.name) { var k = kindFor(d.seller); if (k !== d.kind) { d.kind = k; K.refill(); } }
      if ($('#jc-board')) return;
      var x = NS.el('dialog', { id: 'jc-board', 'aria-labelledby': 'jc-board-h' }, '<div class="dlg-h"><h2 id="jc-board-h"></h2><button type="button" class="btn sm" data-close></button></div><div class="dlg-b" data-board></div>');
      document.body.appendChild(x);
      $('[data-close]', x).addEventListener('click', function () { x.close(); });
      x.addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (!b) return; NSStore.get('doc', b.getAttribute('data-open')).then(function (r) { if (r) { x.close(); K.openDoc(r, false); } }); });
      function names() { $('h2', x).textContent = t('jc.board'); $('[data-close]', x).textContent = t('close'); }
      names(); document.addEventListener('ns-lang', names);
    }
  });
})();
