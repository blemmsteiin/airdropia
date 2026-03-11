import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';

const HalkaArzScreen = () => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <WebView
        source={{ uri: 'https://halkarz.com/' }}
        style={{ flex: 1 }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        startInLoadingState={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        showsHorizontalScrollIndicator={false}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  }
});

export default HalkaArzScreen;
