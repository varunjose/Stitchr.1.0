"""Reproducible DOCX ingestion. Observations are not integration certifications."""
import argparse, hashlib, json, re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
N={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--output',default='data/catalog.json');a=p.parse_args()
raw=Path(a.source).read_bytes()
with ZipFile(a.source) as z:
 root=ET.fromstring(z.read('word/document.xml'));rels=ET.fromstring(z.read('word/_rels/document.xml.rels'))
 urls={r.attrib['Id']:r.attrib.get('Target','') for r in rels}
 records=[];current=None;category='';paras=[];tables=[]
 for t in root.findall('.//w:tbl',N):tables.append([[ ''.join(c.itertext()) for c in row.findall('w:tc',N)] for row in t.findall('w:tr',N)])
 for el in root.find('w:body',N):
  if el.tag!=f"{{{N['w']}}}p":continue
  text=''.join(t.text or '' for t in el.findall('.//w:t',N)).strip();paras.append(text)
  m=re.match(r'^(\d{3})\s+(.+)$',text)
  if m:
   current={'catalog_number':int(m[1]),'name':m[2],'category':category,'references':[]};records.append(current)
  elif text.startswith('Category '):
   category=paras[-2].replace(' continued','');current=None
  elif current:
   for prefix,key in [('Info ','description'),('Price ','price_text'),('Integration route ','integration_route'),('Integration setup ','integration_setup'),('Constraints ','constraints')]:
    if text.startswith(prefix):current[key]=text[len(prefix):]
   if 'Reference access limited' in text:current['reference_access_limited']=True
   for link in el.findall('.//w:hyperlink',N):
    rid=link.attrib.get(f"{{{N['r']}}}id");url=urls.get(rid,'')
    if url.startswith('https://'):current['references'].append(url)
 assert len(records)==156,f'Expected 156 records, found {len(records)}'
 for r in records:
  assert all(k in r for k in ['description','price_text','integration_route','integration_setup','constraints']),r
  r['slug']=re.sub(r'[^a-z0-9]+','-',r['name'].lower()).strip('-')
  r['readiness']='RESEARCHED';r['status']='discovery';r['last_researched']='2026-09-10';r['verified']=False
  r['observed_price_mentions']=[{'currency':{'$':'USD','€':'EUR','£':'GBP','₹':'INR'}[m[1]],'amount':float(m[2].replace(',','')),'context':r['price_text'],'usable_for_estimate':False} for m in re.finditer(r'([$€£₹])([\d,]+(?:\.\d+)?)',r['price_text'])]
 out={'source':{'id':'catalog-2026-09-10','name':'Stitchr Business Tool Catalog','sha256':hashlib.sha256(raw).hexdigest(),'researched_at':'2026-09-10','notes':'All setup paths are proposed. No accounts connected or end-to-end combinations tested. USD unless explicitly stated. Annual amounts are monthly equivalents with annual commitment.'},'tools':records,'tables':tables}
 Path(a.output).write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n');print(f'Imported {len(records)} tools with original text and references → {a.output}')
