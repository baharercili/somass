"""Small, fail-closed URL-only overlay; never edits the reference source tree."""
from urllib.parse import urlsplit

DEFAULT_PUBLIC_URL = 'https://baharercili.github.io/somass/sofa/'
OLD_SITE = 'https://studio-kanepe-configurator.createandgotr.chatgpt.site'


def checked_public_url(value):
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.netloc or url.username or url.password
            or url.query or url.fragment or not url.path.endswith('/')
            or '\\' in value or '%' in url.path or '..' in url.path.split('/')):
        raise ValueError('Expected a clean HTTPS application directory URL')
    return value


def overlay_files(public_url=DEFAULT_PUBLIC_URL):
    public_url = checked_public_url(public_url)
    return {'sofa-site-url.js': (
        '// Resolve metadata at the same application directory as this module.\n'
        "const directory=new URL('./',import.meta.url);\n"
        "export const SOFA_SITE_URL=['https:','http:'].includes(directory.protocol)?directory:new URL("
        + repr(public_url) + ');\n'
    ).encode()}


def patches(public_url=DEFAULT_PUBLIC_URL):
    public_url = checked_public_url(public_url)
    site = "const SITE='" + OLD_SITE + "';"
    origin_site = "import {SOFA_SITE_URL} from './sofa-site-url.js';\nconst SITE=SOFA_SITE_URL.href.replace(/\\/$/,'');"
    return {
        'product-gallery.js': [
            ("url.pathname.startsWith('/assets/')", "url.pathname.startsWith(new URL('./assets/',root).pathname)"),
            ("['/','/index.html'].includes(url.pathname)", "[new URL('./',root).pathname,new URL('./index.html',root).pathname].includes(url.pathname)"),
        ],
        'team-pack-downloads.js': [
            ("url.pathname.startsWith('/assets/')", "url.pathname.startsWith(new URL('./assets/',root).pathname)"),
        ],
        'team-pack.js': [
            ("url.pathname.startsWith('/assets/')", "url.pathname.startsWith(new URL('./assets/',origin).pathname)"),
        ],
        'team-pack-engine.js': [
            ("url.pathname.startsWith('/assets/')", "url.pathname.startsWith(new URL('./assets/',location.href).pathname)"),
        ],
        'product-seo.js': [
            (site, origin_site),
            ('u.origin!==SITE', 'u.origin!==SOFA_SITE_URL.origin'),
            ("u.pathname.startsWith('/assets/')", "u.pathname.startsWith(new URL('./assets/',SOFA_SITE_URL).pathname)"),
        ],
        'product-pack-documents.js': [
            (site, origin_site),
            ('u.origin===SITE', 'u.origin===SOFA_SITE_URL.origin'),
            ("['/','/index.html'].includes(u.pathname)", "[SOFA_SITE_URL.pathname,new URL('./index.html',SOFA_SITE_URL).pathname].includes(u.pathname)"),
        ],
        'zeytin-cift-acili.html': [
            (OLD_SITE + '/index.html', './index.html'),
            (OLD_SITE + '/kombinasyonlar.html', './kombinasyonlar.html'),
        ],
    }


def adapt(name, content, public_url=DEFAULT_PUBLIC_URL):
    changes = patches(public_url).get(name)
    if not changes:
        return content
    source = content.decode('utf-8')
    for old, new in changes:
        if source.count(old) != 1:
            raise ValueError(f'{name}: expected one exact URL anchor: {old}')
        source = source.replace(old, new)
    return source.encode('utf-8')
