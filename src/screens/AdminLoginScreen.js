import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { useTheme, themeColors } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

// Artan kilitlenme süreleri (saniye cinsinden)
const LOGIN_LOCKOUT_TIERS = [
  { attempts: 5,  duration: 60 },     // 5 deneme  → 1 dakika
  { attempts: 10, duration: 300 },    // 10 deneme → 5 dakika
  { attempts: 15, duration: 900 },    // 15 deneme → 15 dakika
  { attempts: 20, duration: 1800 },   // 20 deneme → 30 dakika
  { attempts: 25, duration: 3600 },   // 25+ deneme → 1 saat
];

const STORAGE_KEYS = {
  LOGIN_ATTEMPTS: '@admin_login_attempt_count',
  LOGIN_LOCKOUT_UNTIL: '@admin_login_lockout_until',
};

const getLockoutDuration = (attempts) => {
  let duration = 0;
  for (const tier of LOGIN_LOCKOUT_TIERS) {
    if (attempts >= tier.attempts) {
      duration = tier.duration;
    }
  }
  return duration;
};

const formatCountdown = (seconds) => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}dk ${secs}sn` : `${mins}dk`;
  }
  return `${seconds}sn`;
};

const AdminLoginScreen = ({ navigation }) => {
  const theme = themeColors.dark; // Admin giriş her zaman koyu (dark) tema kalsın
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Cooldown state'leri
  const [loginLockoutRemaining, setLoginLockoutRemaining] = useState(0);
  const loginTimerRef = useRef(null);

  const startCountdown = useCallback((endTime) => {
    if (loginTimerRef.current) clearInterval(loginTimerRef.current);
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    if (remaining <= 0) {
      setLoginLockoutRemaining(0);
      return;
    }
    setLoginLockoutRemaining(remaining);
    loginTimerRef.current = setInterval(() => {
      const left = Math.ceil((endTime - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(loginTimerRef.current);
        loginTimerRef.current = null;
        setLoginLockoutRemaining(0);
      } else {
        setLoginLockoutRemaining(left);
      }
    }, 1000);
  }, []);

  useEffect(() => {
    const checkExistingCooldown = async () => {
      try {
        const lockoutUntil = await AsyncStorage.getItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
        if (lockoutUntil) {
          const endTime = parseInt(lockoutUntil, 10);
          if (endTime > Date.now()) {
            startCountdown(endTime);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
          }
        }
      } catch (e) {
        console.log('Cooldown check error:', e);
      }
    };
    checkExistingCooldown();
    return () => {
      if (loginTimerRef.current) clearInterval(loginTimerRef.current);
    };
  }, [startCountdown]);

  const handleLogin = async () => {
    if (loginLockoutRemaining > 0) {
      Alert.alert('Hesap Kilitlendi', `Çok fazla başarısız deneme yaptınız. Lütfen ${formatCountdown(loginLockoutRemaining)} bekleyin.`);
      return;
    }

    if (!email || !password) {
      Alert.alert('Hata', 'Lütfen e-posta ve şifrenizi girin.');
      return;
    }
    
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      const user = userCredential.user;

      // Firestore'dan rol kontrolü yap
      const { getDoc, doc } = await import('firebase/firestore');
      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (userDoc.exists() && userDoc.data().role === 'admin') {
        // Başarılı giriş → deneme sayacını sıfırla
        await AsyncStorage.multiRemove([STORAGE_KEYS.LOGIN_ATTEMPTS, STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL]);
        setLoginLockoutRemaining(0);
        if (loginTimerRef.current) { clearInterval(loginTimerRef.current); loginTimerRef.current = null; }

        // Admin giriş yaptı olarak işaretle
        await AsyncStorage.setItem('isAdmin_cache', 'true');
        
        // Opsiyonel: Admin kaydını güncelle
        await setDoc(doc(db, 'users', user.uid), {
          lastLogin: new Date()
        }, { merge: true });

        setLoading(false);
      } else {
        // Yetkisiz giriş: Hemen çıkış yap ve cache temizle
        await auth.signOut();
        await AsyncStorage.removeItem('isAdmin_cache');
        setLoading(false);
        Alert.alert('Yetkisiz Giriş', 'Bu panele giriş yetkiniz bulunmamaktadır.');
      }
    } catch (error) {
      setLoading(false);
      
      // Eğer Firebase'e giriş yapabildiyse ama rol okunamadıysa, çıkış yap
      if (auth.currentUser) {
        await auth.signOut();
        await AsyncStorage.removeItem('isAdmin_cache');
      }

      // Başarısız deneme sayacını artır
      try {
        const currentStr = await AsyncStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
        const current = currentStr ? parseInt(currentStr, 10) : 0;
        const newCount = current + 1;
        await AsyncStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, newCount.toString());

        const lockoutDuration = getLockoutDuration(newCount);
        if (lockoutDuration > 0) {
          const endTime = Date.now() + lockoutDuration * 1000;
          await AsyncStorage.setItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL, endTime.toString());
          startCountdown(endTime);
        }
      } catch (e) {
        console.log('Attempt tracking error:', e);
      }

      console.log(error);
      let errorMessage = `E-posta veya şifre hatalı. (Hata Kodu: ${error.code})`;
      if (error.code === 'auth/invalid-credential') errorMessage = 'Geçersiz bilgiler.';
      Alert.alert('Giriş Başarısız', errorMessage);
    }
  };

  const isLocked = loginLockoutRemaining > 0;

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
            <Text style={[styles.title, { color: theme.text }]}>Yönetici Girişi</Text>
            
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              Giriş yapmak için Firebase'de "Authentication" bölümünden bir kullanıcı oluşturmuş olman gerekiyor.
            </Text>

            {/* Kilitlenme uyarısı */}
            {isLocked && (
              <View style={[styles.lockoutBanner, { backgroundColor: theme.card, borderColor: '#e74c3c' }]}>
                <Ionicons name="lock-closed" size={18} color="#e74c3c" />
                <Text style={[styles.lockoutText, { color: '#e74c3c' }]}>
                  Çok fazla başarısız deneme! {formatCountdown(loginLockoutRemaining)} bekleyin.
                </Text>
              </View>
            )}

            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
              placeholder="Yönetici E-posta"
              placeholderTextColor={theme.textSecondary}
              value={email}
              onChangeText={(text) => setEmail(text.toLowerCase().trim())}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card, paddingRight: 50 }]}
                placeholder="Yönetici Şifresi"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity 
                style={{ position: 'absolute', right: 16, top: 16 }} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={[styles.button, { backgroundColor: isLocked ? '#999' : theme.primary }]}
              onPress={handleLogin}
              disabled={loading || isLocked}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : isLocked ? (
                <Text style={styles.buttonText}>🔒 {formatCountdown(loginLockoutRemaining)}</Text>
              ) : (
                <Text style={styles.buttonText}>Giriş Yap</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ marginTop: 24, paddingVertical: 12, alignItems: 'center' }} 
              onPress={() => navigation.goBack()}
            >
              <Text style={{ color: theme.primary, fontSize: 13, textDecorationLine: 'underline' }}>
                ↩ Başa Dön (Kullanıcı Girişine Git)
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
});

export default AdminLoginScreen;
