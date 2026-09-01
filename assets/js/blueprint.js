/* blueprint.js — the exam curriculum, as a coverage checklist.

   WHY THIS EXISTS
   The deck is built from MCQs you have attempted, so it can only ever
   describe what you have already met. It is structurally blind to the
   parts of the syllabus you have never opened. This file supplies the
   other half: the expected shape of the curriculum, so the app can show
   GAPS as well as performance.

   STRUCTURE
   `categories` mirrors the StudyPRN category list (the exam's own
   grouping). Each maps to one or more of the finer taxonomy domains used
   throughout the deck, plus a list of expected `themes`.

   HONESTY NOTE
   The category names come from StudyPRN. The `themes` beneath them are a
   working checklist of core curriculum content — not an official,
   published syllabus. Treat it as editable: add, remove or reword freely.
   A theme counts as covered when any topic or knowledge-base article
   matches one of its `keys`, so keys are matching hints, not content. */

const EXAM_CATEGORIES = [
  { n:1, name:'Glomerulonephritis & tubulointerstitial nephritis',
    note:'incl. vasculitis, anti-GBM disease, SLE',
    domains:['Glomerular Diseases','Tubulointerstitial & Drug-Induced Disease'],
    themes:[
      { label:'IgA nephropathy',                     keys:['iga-nephropathy','iga nephropathy'] },
      { label:'Minimal change disease',              keys:['minimal-change'] },
      { label:'FSGS',                                keys:['focal-segmental','fsgs'] },
      { label:'Membranous nephropathy',              keys:['membranous'] },
      { label:'MPGN / C3 glomerulopathy',            keys:['membranoproliferative','c3 glomerul'] },
      { label:'ANCA-associated vasculitis',          keys:['anca'] },
      { label:'Anti-GBM disease',                    keys:['anti-gbm'] },
      { label:'Lupus nephritis',                     keys:['lupus'] },
      { label:'Rapidly progressive / crescentic GN', keys:['rapidly-progressive','crescentic'] },
      { label:'Nephrotic syndrome & complications',  keys:['nephrotic'] },
      { label:'Amyloidosis & monoclonal deposition', keys:['amyloid'] },
      { label:'Thrombotic microangiopathy',          keys:['thrombotic-microangiopathy','hus','ttp'] },
      { label:'Acute interstitial nephritis',        keys:['interstitial-nephritis','interstitial nephritis'] },
      { label:'Chronic interstitial nephritis',      keys:['chronic-interstitial'] },
      { label:'Post-infectious GN',                  keys:['post-infectious','postinfectious'] },
      { label:'Alport & thin basement membrane',     keys:['alport'] },
    ]},

  { n:2, name:'AKI, acute RRT & fluid/electrolyte/acid–base',
    domains:['Acute Kidney Injury','Fluid, Electrolyte & Acid–Base','Renal Physiology & Pathophysiology'],
    themes:[
      { label:'AKI definition & staging',        keys:['aki-staging','aki definition'] },
      { label:'Acute tubular necrosis',          keys:['tubular-necrosis','atn'] },
      { label:'Contrast-associated AKI',         keys:['contrast'] },
      { label:'Rhabdomyolysis',                  keys:['rhabdo'] },
      { label:'Hepatorenal syndrome',            keys:['hepatorenal'] },
      { label:'Cardiorenal syndrome',            keys:['cardiorenal'] },
      { label:'RRT in AKI / CRRT',               keys:['rrt-in-aki','crrt'] },
      { label:'Hyponatraemia & SIADH',           keys:['hyponatr','siadh'] },
      { label:'Hypernatraemia & diabetes insipidus', keys:['hypernatr','diabetes-insipidus'] },
      { label:'Hyperkalaemia',                   keys:['hyperkal'] },
      { label:'Hypokalaemia & tubulopathies',    keys:['hypokal','bartter','gitelman','liddle'] },
      { label:'Metabolic acidosis & RTA',        keys:['tubular-acidosis','metabolic acidosis'] },
      { label:'Metabolic alkalosis',             keys:['alkalosis'] },
      { label:'Calcium, phosphate & magnesium',  keys:['hypercalc','hypocalc','magnesium','phosphat'] },
      { label:'Acid–base: mixed & respiratory',  keys:['respiratory acidosis','mixed disorder'] },
    ]},

  { n:3, name:'CKD, haematuria & proteinuria',
    domains:['CKD, Complications & Progression'],
    themes:[
      { label:'CKD classification & staging',    keys:['ckd-classification','ckd staging'] },
      { label:'Retarding progression',           keys:['progression','sglt2'] },
      { label:'Proteinuria assessment',          keys:['proteinuria'] },
      { label:'Haematuria evaluation',           keys:['haematuria'] },
      { label:'Cardiovascular risk in CKD',      keys:['cardiovascular'] },
      { label:'Uraemic complications',           keys:['uraemic'] },
      { label:'Assessment of GFR',               keys:['gfr','egfr'] },
    ]},

  { n:4, name:'Renal bone disease & renal anaemia',
    domains:[],  // cross-cuts CKD & Transplantation — matched by theme keys only
    themes:[
      { label:'CKD–mineral & bone disorder',     keys:['mineral-bone','ckd-mbd','mbd'] },
      { label:'Secondary hyperparathyroidism',   keys:['hyperparathyroid','parathyroidectomy'] },
      { label:'Phosphate binders & calcimimetics', keys:['binder','calcimimetic','cinacalcet'] },
      { label:'Anaemia of CKD',                  keys:['anaemia','anemia'] },
      { label:'Iron & ESA therapy',              keys:['iron deficiency','erythropoiesis-stimulating','darbepoetin'] },
    ]},

  { n:5, name:'Cardiovascular disease, hypertension, renovascular disease & diabetes',
    domains:['Hypertension & Renovascular Disease'],
    themes:[
      { label:'Primary hypertension & targets',  keys:['primary hypertension','blood pressure'] },
      { label:'Resistant hypertension',          keys:['resistant-hypertension','denervation'] },
      { label:'Hypertensive emergency',          keys:['emergency','aortic-dissection'] },
      { label:'Renovascular disease',            keys:['renovascular','renal artery'] },
      { label:'Endocrine hypertension',          keys:['primary aldosteronism','conn syndrome','phaeochromocytoma'] },
      { label:'Diabetic kidney disease',         keys:['diabetic'] },
      { label:'ACEi/ARB monitoring',             keys:['ace-inhibitor','acei'] },
    ]},

  { n:6, name:'Urological presentations: stones, UTI & obstruction',
    domains:['Stones & Nephrocalcinosis','Infection & the Kidney'],
    themes:[
      { label:'Nephrolithiasis & stone types',   keys:['stone','lithiasis','cystinuria'] },
      { label:'Stone prevention & metabolic work-up', keys:['stone-diet','prevention of calcium'] },
      { label:'Urinary tract obstruction',       keys:['obstruct'] },
      { label:'Lower & upper UTI',               keys:['urinary-tract-infection','pyelonephritis','uti'] },
      { label:'Catheter-associated UTI',         keys:['catheter-associated'] },
      { label:'Genitourinary TB',                keys:['tuberculosis'] },
      { label:'Prostatitis & urological issues', keys:['prostat'] },
    ]},

  { n:7, name:'Inherited & rarer diseases',
    domains:['Inherited & Congenital Kidney Disease','Onconephrology & Critical Care'],
    themes:[
      { label:'ADPKD',                           keys:['adpkd'] },
      { label:'ARPKD & other cystic disease',    keys:['arpkd','cystic'] },
      { label:'Alport syndrome',                 keys:['alport'] },
      { label:'Fabry disease',                   keys:['fabry'] },
      { label:'HNF-1β / RCAD',                   keys:['hnf1b','hnf-1'] },
      { label:'Von Hippel–Lindau',               keys:['hippel'] },
      { label:'Inherited tubulopathies',         keys:['liddle','bartter','gitelman','fanconi'] },
      { label:'Sickle cell nephropathy',         keys:['sickle'] },
      { label:'Myeloma & the kidney',            keys:['myeloma'] },
      { label:'Onconephrology / TLS',            keys:['onconephrology','tumour-lysis','tumor lysis'] },
      { label:'Sarcoidosis',                     keys:['sarcoid'] },
    ]},

  { n:8, name:'Peritoneal dialysis',
    domains:['Peritoneal Dialysis'],
    themes:[
      { label:'PD principles & prescription',    keys:['peritoneal-dialysis-prescription','pd prescription'] },
      { label:'Transport status (PET) & adequacy', keys:['adequacy','peritoneal equilibration'] },
      { label:'PD peritonitis',                  keys:['pd-peritonitis','peritonitis'] },
      { label:'Ultrafiltration failure',         keys:['ultrafiltration failure','non-infectious'] },
      { label:'Encapsulating peritoneal sclerosis', keys:['encapsulating peritoneal'] },
    ]},

  { n:9, name:'Haemodialysis',
    domains:['Haemodialysis'],
    themes:[
      { label:'HD principles & prescription',    keys:['haemodialysis-prescription','dialysis prescription'] },
      { label:'Adequacy & Kt/V',                 keys:['ktv','kt/v'] },
      { label:'Vascular access',                 keys:['vascular-access','fistula'] },
      { label:'Acute intradialytic complications', keys:['intradialytic','disequilibrium','haemodialysis-complications'] },
      { label:'Dialyser reactions',              keys:['an69','dialyser'] },
      { label:'Electrolyte problems on dialysis', keys:['hypomagnesaemia-in-dialysis','hypophosphataemia'] },
      { label:'Approach to RRT / modality choice', keys:['approach to renal replacement','modality'] },
    ]},

  { n:10, name:'Renal transplantation',
    domains:['Transplantation'],
    themes:[
      { label:'Recipient evaluation & listing',  keys:['perioperative-care','waiting-period','evaluation'] },
      { label:'Living donor assessment',         keys:['living-donor','donor'] },
      { label:'Immunosuppression & CNI toxicity', keys:['immunosuppress','tacrolimus','cni'] },
      { label:'T-cell-mediated rejection & Banff', keys:['banff','tcmr','cellular-rejection'] },
      { label:'Antibody-mediated rejection',     keys:['antibody-mediated'] },
      { label:'Surgical & vascular complications', keys:['surgical-complications','vein-thrombosis'] },
      { label:'Infection & BK virus',            keys:['bk-virus','graft-pyelonephritis'] },
      { label:'Vaccination & prophylaxis',       keys:['vaccin'] },
      { label:'Chronic allograft injury',        keys:['chronic-allograft','allograft-nephropathy'] },
      { label:'The failing / failed graft',      keys:['failed-allograft','graft-intolerance'] },
      { label:'Recurrent disease in the graft',  keys:['recurrent disease'] },
      { label:'Pancreas / SPK transplantation',  keys:['pancreas','spk'] },
    ]},

  { n:11, name:'Other',
    note:'pregnancy, prescribing, nutrition, statistics, palliative',
    domains:['Pregnancy & the Kidney','Pharmacology & Prescribing','Nutrition, Statistics & Research'],
    themes:[
      { label:'Pregnancy: physiology & CKD',     keys:['pregnancy'] },
      { label:'Pre-eclampsia',                   keys:['eclampsia'] },
      { label:'Prescribing & drug dosing in CKD', keys:['prescrib','dosing','gout-in-ckd','digoxin'] },
      { label:'Nutrition in CKD',                keys:['nutrition'] },
      { label:'Statistics & critical appraisal', keys:['statistic','appraisal'] },
      { label:'Geriatric & palliative nephrology', keys:['geriatric','palliative','conservative'] },
      { label:'Plasma exchange',                 keys:['plasma exchange','plasmapheresis'] },
      { label:'Poisoning & extracorporeal removal', keys:['poison','overdose'] },
    ]},
];
