# SOMASS mağaza planlayıcısı

- [Canlı düzenleyici](https://baharercili.github.io/somass/editor/): güncel başlangıç planında 204 yerleşim öğesi ve 27 duvar.
- [Müşteri görünümü](https://baharercili.github.io/somass/view/): korunan önceki 165 öğeli plan; yalnız görüntüleme.
- Katalog: 309 SOMASS ürünü. Kaldırılmış Zara halılarının model ve görsel paketleri bu yayında bulunmaz.

Düzenleyici değişiklikleri kullanılan tarayıcıda saklar. Başka cihazda devam etmek veya kalıcı yedek tutmak için düzenlenebilir JSON dosyasını kaydedin; devam ederken **Plan aç** ile yükleyin. Müşteri görünümünde düzenleme ve kayıt aracı yoktur.

## Kaynak paketi ve yayın

Bu depo, doğrulanmış uygulama kaynağını `somass-source.part-*` parçalarında saklar. `somass-source-manifest.json`, parçaların ve kaynak arşivinin boyutları ile SHA-256 değerlerini tanımlar. Müşteri görünümünün mevcut paket parçaları ayrıca korunur.

GitHub Actions iş akışı parçaları doğrular, kaynağı `_source/` klasörüne güvenle açar, mevcut müşteri paketlerini ekler ve sıkı derlemeyi çalıştırır. Yalnız `_source/_site/` çıktısı GitHub Pages ile yayımlanır. Depo kökünde doğrudan çalıştırılacak bir `tools/` klasörü bulunmaz.

Yeniden yayın için güncel kaynak parçaları ve bunlarla eşleşen manifest birlikte depoya eklenmelidir. Manifest veya `.github/workflows/pages.yml` değişince yayın çalışır; **Actions → Publish full SOMASS project → Run workflow** ile de başlatılabilir. Pages kaynağı **GitHub Actions** olmalıdır.

Özel ölçüm fotoğrafları, yerel kayıt bağlantıları ve erişim anahtarları kaynak paketine dahil değildir. Duvarlar, yerleşim, ölçüler, kalan ürün geometrileri ve malzemeleri bu yayın sırasında değiştirilmez.
