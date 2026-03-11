import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';

const AdminDashboardScreen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const target = route.params?.target || 'airdrops';
  const isDiscount = target === 'discounts';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('active');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [targetAudience, setTargetAudience] = useState('everyone');
  const [reward, setReward] = useState('');
  const [rewardDate, setRewardDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [profitAmount, setProfitAmount] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Header seçeneklerini temizle veya varsayılanda bırak
  }, [navigation]);

  const handleSave = async () => {
    if (!title || !description || !url || !endDate) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    if (isDiscount && discountPercentage && profitAmount) {
      Alert.alert('Hata', 'Lütfen sadece İndirim Yüzdesi YA DA Kazanç miktarından birini doldurun.');
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        title,
        description,
        url,
        endDate,
        status,
        commentsEnabled,
        createdAt: serverTimestamp()
      };

      if (isDiscount) {
        if (discountPercentage) payload.discountPercentage = discountPercentage;
        if (profitAmount) payload.profitAmount = profitAmount;
        payload.discountCode = discountCode;
      } else {
        payload.targetAudience = targetAudience;
        payload.reward = reward;
        payload.rewardDate = rewardDate;
        payload.inviteCode = inviteCode;
      }

      await addDoc(collection(db, target), payload);
      
      setLoading(false);
      Alert.alert('Başarılı', isDiscount ? 'İndirim başarıyla yayınlandı!' : 'Airdrop başarıyla yayınlandı!', [
        { text: 'Tamam', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      setLoading(false);
      console.log('Firebase Error Details:', error);
      Alert.alert('Hata', `Airdrop eklenirken bir sroun oluştu: ${error.message || 'Bilinmeyen Hata'}`);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.text }]}>{isDiscount ? 'Yeni İndirim Ekle' : 'Yeni Airdrop Ekle'}</Text>
      
      <TextInput 
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
        placeholder={isDiscount ? "İndirim Başlığı" : "Airdrop Başlığı"} 
        placeholderTextColor={theme.textSecondary}
        value={title} 
        onChangeText={setTitle} 
      />
      
      <TextInput 
        style={[styles.input, styles.textArea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
        placeholder={isDiscount ? "İndirim Açıklaması" : "Airdrop Açıklaması"} 
        placeholderTextColor={theme.textSecondary}
        value={description} 
        onChangeText={setDescription} 
        multiline 
      />
      
      <TextInput 
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
        placeholder="Katılım Linki (URL)" 
        placeholderTextColor={theme.textSecondary}
        value={url} 
        onChangeText={setUrl} 
      />
      
      <TextInput 
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
        placeholder="Son Katılım Tarihi (örn. 15 Kasım)" 
        placeholderTextColor={theme.textSecondary}
        value={endDate} 
        onChangeText={setEndDate} 
      />

      {isDiscount ? (
        <>
          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
            placeholder="İndirim Yüzdesi (örn. %50) [Kazanç ile aynı anda girilmez]" 
            placeholderTextColor={theme.textSecondary}
            value={discountPercentage} 
            onChangeText={setDiscountPercentage} 
          />
          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
            placeholder="Kazanç (örn. 50 TL) [Yüzde ile aynı anda girilmez]" 
            placeholderTextColor={theme.textSecondary}
            value={profitAmount} 
            onChangeText={setProfitAmount} 
          />
          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
            placeholder="İndirim Kodu (opsiyonel, örn. GHOST50)" 
            placeholderTextColor={theme.textSecondary}
            value={discountCode} 
            onChangeText={setDiscountCode} 
          />
        </>
      ) : (
        <>
          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
            placeholder="Kampanya Ödülü (örn. 500 USDT)" 
            placeholderTextColor={theme.textSecondary}
            value={reward} 
            onChangeText={setReward} 
          />

          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
            placeholder="Ödül Dağıtım Tarihi (örn. 20 Nisan)" 
            placeholderTextColor={theme.textSecondary}
            value={rewardDate} 
            onChangeText={setRewardDate} 
          />
        </>
      )}
      
      <View style={styles.statusContainer}>
        <Text style={[styles.statusLabel, { color: theme.text }]}>Durum:</Text>
        <View style={styles.statusButtons}>
          <TouchableOpacity 
            style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, status === 'active' && styles.statusBtnActive]} 
            onPress={() => setStatus('active')}
          >
            <Text style={[styles.statusBtnText, { color: theme.textSecondary }, status === 'active' && styles.statusBtnTextActive]}>Aktif</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, status === 'finished' && styles.statusBtnActive]} 
            onPress={() => setStatus('finished')}
          >
            <Text style={[styles.statusBtnText, { color: theme.textSecondary }, status === 'finished' && styles.statusBtnTextActive]}>Bitmiş</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.statusContainer}>
        <Text style={[styles.statusLabel, { color: theme.text }]}>Yorumlar:</Text>
        <View style={styles.statusButtons}>
          <TouchableOpacity 
            style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, commentsEnabled === true && styles.statusBtnActive]} 
            onPress={() => setCommentsEnabled(true)}
          >
            <Text style={[styles.statusBtnText, { color: theme.textSecondary }, commentsEnabled === true && styles.statusBtnTextActive]}>Açık</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, commentsEnabled === false && styles.statusBtnActive]} 
            onPress={() => setCommentsEnabled(false)}
          >
            <Text style={[styles.statusBtnText, { color: theme.textSecondary }, commentsEnabled === false && styles.statusBtnTextActive]}>Kapalı</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isDiscount && (
        <View style={styles.statusContainer}>
          <Text style={[styles.statusLabel, { color: theme.text }]}>Hedef Kitle:</Text>
          <View style={styles.statusButtons}>
            <TouchableOpacity 
              style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, targetAudience === 'everyone' && styles.statusBtnActive]} 
              onPress={() => setTargetAudience('everyone')}
            >
              <Text style={[styles.statusBtnText, { color: theme.textSecondary }, targetAudience === 'everyone' && styles.statusBtnTextActive]}>Herkes</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, targetAudience === 'new' && styles.statusBtnActive]} 
              onPress={() => setTargetAudience('new')}
            >
              <Text style={[styles.statusBtnText, { color: theme.textSecondary }, targetAudience === 'new' && styles.statusBtnTextActive]}>Yeni Üyeler</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.statusBtn, { borderColor: theme.border, backgroundColor: theme.card }, targetAudience === 'old' && styles.statusBtnActive]} 
              onPress={() => setTargetAudience('old')}
            >
              <Text style={[styles.statusBtnText, { color: theme.textSecondary }, targetAudience === 'old' && styles.statusBtnTextActive]}>Eski Üyeler</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isDiscount && (
        <TextInput 
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]} 
          placeholder="Davet Kodu (opsiyonel)" 
          placeholderTextColor={theme.textSecondary}
          value={inviteCode} 
          onChangeText={setInviteCode} 
        />
      )}
      
      <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Kaydet ve Yayınla</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  statusContainer: {
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusBtnActive: {
    backgroundColor: '#007AFF', // Theme Primary genelde
    borderColor: '#007AFF',
  },
  statusBtnText: {
    fontWeight: 'bold',
  },
  statusBtnTextActive: {
    color: '#fff',
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AdminDashboardScreen;
