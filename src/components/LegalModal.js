import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const LegalModal = ({ visible, onClose, type }) => {
  const { theme } = useTheme();

  const content = {
    privacy: {
      title: 'Gizlilik Politikası',
      text: `
Airdropia olarak gizliliğinize büyük önem veriyoruz. Bu Gizlilik Politikası, mobil uygulamamızı kullandığınızda kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklamaktadır.

1. TOPLANAN VERİLER
Uygulamamıza kayıt olurken paylaştığınız e-posta adresi ve kullanıcı adı, temel hizmetlerin sunulması için zorunludur. Profilinize kendi isteğinizle eklediğiniz görseller (avatar) ve yorumlar da veri tabanımızda saklanmaktadır.

2. VERİLERİN KULLANIM AMACI
Topladığımız verileri şu amaçlarla kullanırız:
- Uygulama içi kimlik doğrulama ve hesap yönetimi sağlamak.
- Yeni airdrop projeleri ve indirimler hakkında size bildirimler göndermek.
- Yorumlar ve kullanıcı etiketleme sistemi ile topluluk etkileşimini sürdürmek.
- Destek taleplerinizi yanıtlamak ve teknik sorunları gidermek.

3. VERİ GÜVENLİĞİ VE SAKLAMA
Verileriniz Google Firebase altyapısı kullanılarak endüstri standartlarında şifrelenmiş bir şekilde saklanmaktadır. Şifreniz hiçbir zaman açık metin olarak tutulmaz, sadece sistem tarafından hashlenerek saklanır.

4. ÜÇÜNCÜ TARAFLARLA PAYLAŞIM
Airdropia, kişisel verilerinizi asla üçüncü şahıslara veya reklam şirketlerine satmaz, kiralamaz veya paylaşmaz. Verileriniz sadece yasal zorunluluk durumlarında, yetkili makamlarca talep edilmesi halinde paylaşılabilir.

5. HESAP SİLME VE VERİLERİN KORUNMASI
İstediğiniz zaman Profil ekranı üzerinden hesabınızı kalıcı olarak silebilirsiniz. Hesabınız silindiğinde tüm kişisel verileriniz (yorumlarınız, avatarınız, profil bilgileriniz) sistemimizden temizlenir. Ancak güvenlik politikamız gereği, silinen hesapların e-posta adresleri "Deleted Emails" listemizde saklanır ve aynı e-posta ile tekrar üyelik açılmasına izin verilmez.

6. İLETİŞİM
Gizlilik politikamız hakkında sorularınız için uygulama içi Destek Talebi (Ticket) sistemini kullanabilirsiniz.
      `
    },
    terms: {
      title: 'Kullanım Koşulları',
      text: `
Airdropia mobil uygulamasına erişerek ve kullanarak, aşağıdaki kullanım koşullarını kabul etmiş sayılırsınız. Lütfen bu metni dikkatle okuyunuz.

1. HİZMETİN AMACI
Airdropia, kullanıcılara güncel kripto para airdrop projeleri, çekilişler ve indirimler hakkında bilgi sağlayan bir platformdur. Uygulama içerisinde sunulan hiçbir bilgi "Yatırım Tavsiyesi" (Financial Advice) niteliği taşımaz.

2. KULLANICI SORUMLULUĞU
- Uygulama içeriğinde paylaşılan projelerin doğruluğu için azami özen gösterilse de, her projenin kendi riskleri bulunmaktadır. Kullanıcının bir projeye katılmadan önce kendi araştırmasını yapması (DYOR) kendi sorumluluğundadır.
- Kullanıcı, diğer kullanıcıları rahatsız edici, hakaret içerikli, yanıltıcı veya genel ahlaka aykırı yorumlarda bulunmayacağını taahhüt eder.

3. HESAP GÜVENLİĞİ VE KURALLAR
- Kullanıcı adınızda büyük harf veya boşluk kullanılamaz.
- Hesap silme işlemi gerçekleştiren kullanıcılar, aynı e-posta adresiyle tekrar kayıt olamayacaklarını kabul ederler.
- Kötü niyetli kullanım veya sistem açıklarını suistimal etme durumunda, Airdropia kullanıcının erişimini haber vermeksizin kısıtlama veya sonlandırma hakkını saklı tutar.

4. FİKRİ MÜLKİYET
Uygulama tasarımı, logolar, yazılım kodları ve Airdropia markası tarafımıza aittir. İzinsiz kopyalanması veya ticari bir amaçla kullanılması yasaktır.

5. SORUMLULUK REDDİ
Airdropia, harici linkler aracılığıyla gidilen üçüncü taraf projelerinin içeriğinden, ödeme yapıp yapmamasından veya yaşanabilecek herhangi bir finansal kayıptan sorumlu tutulamaz. Uygulama "olduğu gibi" sunulmaktadır.

6. DEĞİŞİKLİKLER
Airdropia, bu koşulları herhangi bir zamanda güncelleme hakkına sahiptir. Güncellenen koşullar uygulamada yayınlandığı andan itibaren geçerli olur.
      `
    }
  };

  const currentContent = type === 'privacy' ? content.privacy : content.terms;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>{currentContent.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.contentText, { color: theme.text }]}>
              {currentContent.text.trim()}
            </Text>
            <View style={{ height: 40 }} />
          </ScrollView>

          <TouchableOpacity 
            style={[styles.doneButton, { backgroundColor: theme.primary }]} 
            onPress={onClose}
          >
            <Text style={styles.doneButtonText}>Anladım</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderBottomWidth: 1,
    position: 'relative',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    right: 15,
  },
  content: {
    padding: 20,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
  },
  doneButton: {
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

export default LegalModal;
