"""Check the published collection page, a preview, and the exact original GLB."""
import hashlib,json,os,re,time
from urllib.request import Request,urlopen
from urllib.parse import urljoin
base=os.environ['SOMASS_PAGES_URL'].rstrip('/')+'/koleksiyonlar/'
def get(url,limit):
    with urlopen(Request(url,headers={'User-Agent':'SOMASS-Collection-Publication-Check'}),timeout=45)as response:
        if response.status!=200:raise ValueError('Unexpected HTTP status '+str(response.status))
        body=response.read(limit+1)
        if len(body)>limit:raise ValueError('Response exceeds expected bound')
        return body
for attempt in range(6):
    try:
        page=get(base,2*1024*1024)
        match=re.search(rb'<script id="review-data" type="application/json">(.*?)</script>',page,re.S)
        if not match:raise ValueError('Published review data missing')
        data=json.loads(match[1])
        if len(data['collections'])!=13 or len([p for p in data['products']if not p['test']])!=138:
            raise ValueError('Published collection counts differ')
        preview=next(iter(data['assets'].values()))
        if hashlib.sha256(get(urljoin(base,preview['data']),2*1024*1024)).hexdigest()!=preview['sha256']:
            raise ValueError('Published preview checksum differs')
        product=next(p for p in data['products']if p['id']=='bono-yemek-masasi')
        model=data['modelIndex'][product['hostedModel']]
        payload=b''.join(get(urljoin(base,p['src']),p['bytes'])for p in model['parts'])
        if len(payload)!=model['bytes']or hashlib.sha256(payload).hexdigest()!=product['modelSHA256']:
            raise ValueError('Published original GLB checksum differs')
        print('Published collection review verified:',base)
        print('HTTP200;13collections;138products;preview SHA256;exact original Bono GLB SHA256 and',len(payload),'bytes.')
        break
    except Exception as error:
        if attempt==5:raise
        print('Publication propagation retry',attempt+1,type(error).__name__)
        time.sleep(8)
