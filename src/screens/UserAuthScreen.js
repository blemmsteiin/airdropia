import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { useTheme, themeColors } from '../context/ThemeContext';
import { doc, setDoc, getDoc, query, where, collection, getDocs } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LegalModal from '../components/LegalModal';

// Artan kilitlenme süreleri (saniye cinsinden)
const LOGIN_LOCKOUT_TIERS = [
  { attempts: 5,  duration: 60 },     // 5 deneme  → 1 dakika
  { attempts: 10, duration: 300 },    // 10 deneme → 5 dakika
  { attempts: 15, duration: 900 },    // 15 deneme → 15 dakika
  { attempts: 20, duration: 1800 },   // 20 deneme → 30 dakika
  { attempts: 25, duration: 3600 },   // 25+ deneme → 1 saat
];

const PASSWORD_RESET_COOLDOWN = 120; // 2 dakika (saniye)

const STORAGE_KEYS = {
  LOGIN_ATTEMPTS: '@user_login_attempt_count',
  LOGIN_LOCKOUT_UNTIL: '@user_login_lockout_until',
  PASSWORD_RESET_COOLDOWN: '@password_reset_cooldown',
};

// Deneme sayısına göre kilitlenme süresini hesapla
const getLockoutDuration = (attempts) => {
  let duration = 0;
  for (const tier of LOGIN_LOCKOUT_TIERS) {
    if (attempts >= tier.attempts) {
      duration = tier.duration;
    }
  }
  return duration;
};

// Kalan süreyi okunabilir formata çevir
const formatCountdown = (seconds) => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}dk ${secs}sn` : `${mins}dk`;
  }
  return `${seconds}sn`;
};

const UserAuthScreen = ({ navigation }) => {
  const theme = themeColors.dark; // Giriş/Kayıt ekranı her zaman koyu (dark) tema kalsın
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalType, setLegalType] = useState('privacy');

  // Cooldown state'leri
  const [loginLockoutRemaining, setLoginLockoutRemaining] = useState(0);
  const [resetCooldownRemaining, setResetCooldownRemaining] = useState(0);
  const [verificationCooldownRemaining, setVerificationCooldownRemaining] = useState(0);
  const loginTimerRef = useRef(null);
  const resetTimerRef = useRef(null);
  const verificationTimerRef = useRef(null);

  // Geri sayım başlat (ortak fonksiyon)
  const startCountdown = useCallback((endTime, setRemaining, timerRef) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      setRemaining(0);
      return;
    }
    setRemaining(remaining);
    timerRef.current = setInterval(() => {
      const left = Math.ceil((endTime - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setRemaining(0);
      } else {
        setRemaining(left);
      }
    }, 1000);
  }, []);

  // Uygulama açıldığında mevcut cooldown'ları kontrol et
  useEffect(() => {
    const checkExistingCooldowns = async () => {
      try {
        const lockoutUntil = await AsyncStorage.getItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
        if (lockoutUntil) {
          const endTime = parseInt(lockoutUntil, 10);
          if (endTime > Date.now()) {
            startCountdown(endTime, setLoginLockoutRemaining, loginTimerRef);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
          }
        }

        const resetUntil = await AsyncStorage.getItem(STORAGE_KEYS.PASSWORD_RESET_COOLDOWN);
        if (resetUntil) {
          const endTime = parseInt(resetUntil, 10);
          if (endTime > Date.now()) {
            startCountdown(endTime, setResetCooldownRemaining, resetTimerRef);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.PASSWORD_RESET_COOLDOWN);
          }
        }
      } catch (e) {
        console.log('Cooldown check error:', e);
      }
    };
    checkExistingCooldowns();
    return () => {
      if (loginTimerRef.current) clearInterval(loginTimerRef.current);
      if (resetTimerRef.current) clearInterval(resetTimerRef.current);
      if (verificationTimerRef.current) clearInterval(verificationTimerRef.current);
    };
  }, [startCountdown]);

  const handleForgotPassword = async () => {
    if (resetCooldownRemaining > 0) {
      Alert.alert('Lütfen Bekleyin', `Tekrar şifre sıfırlama isteği göndermek için ${formatCountdown(resetCooldownRemaining)} beklemeniz gerekiyor.`);
      return;
    }

    if (!email) {
      Alert.alert('E-posta Gerekli', 'Şifrenizi sıfırlamak için lütfen önce e-posta adresinizi yukarıdaki alana girin.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);

      // Cooldown başlat
      const endTime = Date.now() + PASSWORD_RESET_COOLDOWN * 1000;
      await AsyncStorage.setItem(STORAGE_KEYS.PASSWORD_RESET_COOLDOWN, endTime.toString());
      startCountdown(endTime, setResetCooldownRemaining, resetTimerRef);

      Alert.alert('Bağlantı Gönderildi', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu (ve spam klasörünü) kontrol edin.');
    } catch (error) {
      console.log('Password reset error:', error);
      let errorMessage = 'Şifre sıfırlama e-postası gönderilemedi.';
      if (error.code === 'auth/invalid-email') errorMessage = 'Geçersiz e-posta adresi.';
      if (error.code === 'auth/user-not-found') errorMessage = 'Bu e-posta adresine kayıtlı bir kullanıcı bulunamadı.';
      Alert.alert('İşlem Başarısız', errorMessage);
    }
  };

  const handleResendVerification = async (user) => {
    if (verificationCooldownRemaining > 0) {
      Alert.alert('Lütfen Bekleyin', `Tekrar doğrulama maili göndermek için ${formatCountdown(verificationCooldownRemaining)} beklemeniz gerekiyor.`);
      return;
    }

    try {
      await sendEmailVerification(user);
      
      // 1 dakikalık cooldown (60 saniye)
      const endTime = Date.now() + 60 * 1000;
      startCountdown(endTime, setVerificationCooldownRemaining, verificationTimerRef);
      
      Alert.alert('Mail Gönderildi', 'Doğrulama bağlantısı tekrar e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    } catch (error) {
      console.log('Verification resend error:', error);
      Alert.alert('Hata', 'Doğrulama e-postası şu an gönderilemiyor. Lütfen daha sonra tekrar deneyin.');
    }
  };

  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: '', color: theme.border };
    if (pass.length < 6) return { score: 1, label: 'Zayıf', color: '#e74c3c' };
    
    const hasNumbers = /\d/.test(pass);
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    
    if (hasNumbers && hasSymbols && pass.length >= 8) {
      return { score: 3, label: 'Güçlü', color: '#2ecc71' };
    }
    return { score: 2, label: 'Orta', color: '#f1c40f' };
  };

  const strength = getPasswordStrength(password);

  const handleAuth = async () => {
    if (isLogin && loginLockoutRemaining > 0) {
      Alert.alert('Hesap Kilitlendi', `Çok fazla başarısız deneme yaptınız. Lütfen ${formatCountdown(loginLockoutRemaining)} bekleyin.`);
      return;
    }

    if (!email || !password || (!isLogin && !username)) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    // Yüksek güvenlikli Emoji / Boşluk / Büyük Harf Kontrolü (Sisteme sızmayı önler)
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    
    if (emojiRegex.test(email) || emojiRegex.test(password) || (!isLogin && emojiRegex.test(username))) {
      Alert.alert('Hata', 'Kullanıcı adı, e-posta veya şifre içerisinde emoji kullanılamaz.');
      return;
    }

    if (!isLogin && (/\s/.test(username) || /[A-Z]/.test(username))) {
      Alert.alert('Hata', 'Kullanıcı adında boşluk veya büyük harf bulunamaz.');
      return;
    }

    if (!isLogin && password.length < 8) {
      Alert.alert('Hata', 'Şifre en az 8 karakter olmalıdır.');
      return;
    }

    if (!isLogin && !privacyAccepted) {
      Alert.alert('Eksik Onay', 'Devam etmek için Gizlilik Sözleşmesi ve Kullanım Koşullarını onaylamanız gerekmektedir.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Giriş Yap
        const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);

        if (!userCredential.user.emailVerified) {
          const user = userCredential.user;
          setLoading(false);
          
          Alert.alert(
            'E-posta Onayı Bekleniyor',
            'Lütfen giriş yapmadan önce e-posta adresinize gönderilen doğrulama linkine tıklayarak hesabınızı onaylayın.',
            [
              { text: 'Tamam', style: 'cancel' },
              { 
                text: verificationCooldownRemaining > 0 ? `Tekrar Gönder (${formatCountdown(verificationCooldownRemaining)})` : 'Tekrar Gönder', 
                onPress: () => handleResendVerification(user),
                disabled: verificationCooldownRemaining > 0
              }
            ]
          );
          
          await auth.signOut(); // Doğrulama yoksa çıkar
          return;
        }

        // Başarılı giriş → deneme sayacını sıfırla
        await AsyncStorage.multiRemove([STORAGE_KEYS.LOGIN_ATTEMPTS, STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL]);
        setLoginLockoutRemaining(0);
        if (loginTimerRef.current) { clearInterval(loginTimerRef.current); loginTimerRef.current = null; }

        // Akıllı Rol Kontrolü: Firestore'dan kullanıcının rolünü kontrol et
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          await AsyncStorage.setItem('isAdmin_cache', 'true');
        } else {
          await AsyncStorage.removeItem('isAdmin_cache');
        }
        
        setLoading(false);
      } else {
        // Kayıt Ol
        const lowerEmail = email.toLowerCase().trim();
        
        // 1. Kara liste (Silinmiş e-posta) kontrolü
        const deletedEmailDoc = await getDoc(doc(db, 'deleted_emails', lowerEmail));
        if (deletedEmailDoc.exists()) {
          setLoading(false);
          Alert.alert(
            'Kilitli Hesap',
            'Bu e-posta adresiyle daha önce bir hesap silinmiş. Güvenlik politikalarımız gereği silinen e-postalarla tekrar hesap açılamaz. Lütfen farklı bir e-posta adresi deneyin.'
          );
          return;
        }

        // 2. Kullanıcı adı benzersizlik kontrolü
        const usernameQuery = query(collection(db, 'users'), where('username', '==', username));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (!usernameSnapshot.empty) {
          setLoading(false);
          Alert.alert('Kullanıcı Adı Dolu', 'Bu kullanıcı adı zaten başka bir üye tarafından alınmış. Lütfen farklı bir tane deneyin.');
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, lowerEmail, password);
        const user = userCredential.user;

        // Kullanıcıya isim atama
        await updateProfile(user, { displayName: username });

        // (İsteğe bağlı) Kullanıcıyı veritabanına da kaydedebiliriz
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          username: username,
          role: 'user',
          createdAt: new Date()
        });

        // E-posta doğrulama gönder ve çıkış yap (onaylanmadan giremesin)
        await sendEmailVerification(user);
        await auth.signOut();

        setLoading(false);
        Alert.alert(
          'Hesap Oluşturuldu 🎉',
          'Kayıt işlemi başarılı! Lütfen e-posta adresinize gelen doğrulama bağlantısına (Spam klasörüne de bakmayı unutmayın) tıklayarak hesabınızı aktifleştirin, ardından giriş yapın.'
        );
        setIsLogin(true); // Giriş ekranına yönlendir
      }
    } catch (error) {
      setLoading(false);

      // Sadece giriş denemelerinde sayacı artır
      if (isLogin) {
        try {
          const currentStr = await AsyncStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
          const current = currentStr ? parseInt(currentStr, 10) : 0;
          const newCount = current + 1;
          await AsyncStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, newCount.toString());

          const lockoutDuration = getLockoutDuration(newCount);
          if (lockoutDuration > 0) {
            const endTime = Date.now() + lockoutDuration * 1000;
            await AsyncStorage.setItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL, endTime.toString());
            startCountdown(endTime, setLoginLockoutRemaining, loginTimerRef);
          }
        } catch (e) {
          console.log('Attempt tracking error:', e);
        }
      }

      let errorMessage = `Bir hata oluştu. (Hata Kodu: ${error.code})`;
      if (error.code === 'auth/email-already-in-use') errorMessage = 'Bu e-posta zaten kullanımda.';
      if (error.code === 'auth/invalid-email') errorMessage = 'Geçersiz e-posta adresi.';
      if (error.code === 'auth/weak-password') errorMessage = 'Şifre çok zayıf (en az 8 karakter olmalı).';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'E-posta veya şifre hatalı.';
      }
      Alert.alert('İşlem Başarısız', errorMessage);
    }
  };

  const isLoginLocked = isLogin && loginLockoutRemaining > 0;
  const isResetLocked = resetCooldownRemaining > 0;

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.contentWrapper}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../../assets/images/logo.png')} 
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={[styles.title, { color: theme.text }]}>
              {isLogin ? 'Üye Girişi' : 'Kayıt Ol'}
            </Text>

            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              Airdropları kolayca takip edebilmek için {isLogin ? 'giriş yapmalısınız' : 'hesap oluşturmalısınız'}.
            </Text>

            {/* Giriş kilitlenme uyarısı */}
            {isLoginLocked && (
              <View style={[styles.lockoutBanner, { backgroundColor: theme.card, borderColor: '#e74c3c' }]}>
                <Ionicons name="lock-closed" size={18} color="#e74c3c" />
                <Text style={[styles.lockoutText, { color: '#e74c3c' }]}>
                  Çok fazla başarısız deneme! {formatCountdown(loginLockoutRemaining)} bekleyin.
                </Text>
              </View>
            )}

            {!isLogin && (
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                placeholder="Kullanıcı Adı"
                placeholderTextColor={theme.textSecondary}
                value={username}
                onChangeText={(text) => {
                  const sanitized = text
                    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
                    .replace(/[ıİşŞçÇğĞüÜöÖ,."\-]/g, '')
                    .replace(/\s+/g, '')
                    .toLowerCase();
                  setUsername(sanitized);
                }}
              />
            )}

            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="E-posta Adresi"
              placeholderTextColor={theme.textSecondary}
              value={email}
              onChangeText={(text) => setEmail(text.toLowerCase().trim())}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, paddingRight: 50 }]}
                placeholder={isLogin ? 'Şifre' : 'Şifre (en az 8 karakter)'}
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(text) => {
                  const sanitized = text
                    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
                    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
                    .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
                    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
                    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
                    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
                    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
                    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
                    .replace(/[\u{2600}-\u{26FF}]/gu, '')
                    .replace(/[\u{2700}-\u{27BF}]/gu, '')
                    .replace(/\s+/g, '');
                  setPassword(sanitized);
                }}
              />
              <TouchableOpacity
                style={{ position: 'absolute', right: 16, top: 16 }}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {!isLogin && password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarContainer}>
                  <View 
                    style={[
                      styles.strengthBar, 
                      { 
                        width: `${(strength.score / 3) * 100}%`, 
                        backgroundColor: strength.color 
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.strengthText, { color: strength.color }]}>Şifre Gücü: {strength.label}</Text>
              </View>
            )}

            {!isLogin && (
              <TouchableOpacity 
                style={styles.privacyContainer} 
                onPress={() => setPrivacyAccepted(!privacyAccepted)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.checkbox, 
                  { borderColor: theme.border },
                  privacyAccepted && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}>
                  {privacyAccepted && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                  <Text 
                    style={{ color: theme.primary }} 
                    onPress={() => { setLegalType('privacy'); setLegalVisible(true); }}
                  >Gizlilik Sözleşmesi</Text> ve <Text 
                    style={{ color: theme.primary }} 
                    onPress={() => { setLegalType('terms'); setLegalVisible(true); }}
                  >Kullanım Koşullarını</Text> okudum, kabul ediyorum.
                </Text>
              </TouchableOpacity>
            )}

            <LegalModal 
              visible={legalVisible} 
              type={legalType} 
              onClose={() => setLegalVisible(false)} 
            />

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: isLoginLocked ? '#999' : theme.primary }
              ]}
              onPress={handleAuth}
              disabled={loading || isLoginLocked}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : isLoginLocked ? (
                <Text style={styles.buttonText}>🔒 {formatCountdown(loginLockoutRemaining)}</Text>
              ) : (
                <Text style={styles.buttonText}>{isLogin ? 'Giriş Yap' : 'Kayıt Ol'}</Text>
              )}
            </TouchableOpacity>

            {isLogin && (
              <TouchableOpacity
                style={[styles.forgotPasswordButton, isResetLocked && { opacity: 0.5 }]}
                onPress={handleForgotPassword}
                disabled={isResetLocked}
              >
                <Text style={[styles.forgotPasswordText, { color: theme.textSecondary }]}>
                  {isResetLocked ? `Şifremi Unuttum (${formatCountdown(resetCooldownRemaining)})` : 'Şifremi Unuttum'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.toggleButton} onPress={() => setIsLogin(!isLogin)}>
              <Text style={[styles.toggleText, { color: theme.primary }]}>
                {isLogin ? 'Hesabın yok mu? Kayıt Ol' : 'Zaten hesabın var mı? Giriş Yap'}
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 0,
    marginTop: -20,
  },
  logo: {
    width: 220,
    height: 220,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  lockoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  lockoutText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  strengthContainer: {
    marginBottom: 16,
    marginTop: -8,
  },
  strengthBarContainer: {
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '600',
  },
  privacyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  privacyText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});

export default UserAuthScreen;
