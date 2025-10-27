import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';

interface LanguageOption {
  label: string;
  value: string;
  country: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { label: 'English (US)', value: 'en-US', country: 'US' },
  { label: 'English (UK)', value: 'en-GB', country: 'GB' },
  { label: 'Spanish (Mexico)', value: 'es-MX', country: 'MX' },
  { label: 'Spanish (Spain)', value: 'es-ES', country: 'ES' },
  { label: 'Chinese (Simplified)', value: 'zh-CN', country: 'CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW', country: 'TW' },
  { label: 'French', value: 'fr-FR', country: 'FR' },
  { label: 'German', value: 'de-DE', country: 'DE' },
  { label: 'Japanese', value: 'ja-JP', country: 'JP' },
  { label: 'Korean', value: 'ko-KR', country: 'KR' },
  { label: 'Portuguese (Brazil)', value: 'pt-BR', country: 'BR' },
  { label: 'Russian', value: 'ru-RU', country: 'RU' },
  { label: 'Arabic', value: 'ar-SA', country: 'SA' },
  { label: 'Hindi', value: 'hi-IN', country: 'IN' },
  { label: 'Italian', value: 'it-IT', country: 'IT' },
  { label: 'Dutch', value: 'nl-NL', country: 'NL' },
  { label: 'Polish', value: 'pl-PL', country: 'PL' },
  { label: 'Turkish', value: 'tr-TR', country: 'TR' },
  { label: 'Vietnamese', value: 'vi-VN', country: 'VN' },
  { label: 'Thai', value: 'th-TH', country: 'TH' },
];

export function LanguagePicker() {
  const user = useStore((state) => state.user);
  const [selectedLanguage, setSelectedLanguage] = useState(user?.preferredLanguage || 'en-US');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.preferredLanguage) {
      setSelectedLanguage(user.preferredLanguage);
    }
  }, [user?.preferredLanguage]);

  const saveLanguageSettings = async (newLanguage: string) => {
    if (!user) return;

    // Find the country code for the selected language
    const languageOption = LANGUAGE_OPTIONS.find((opt) => opt.value === newLanguage);
    if (!languageOption) return;

    setIsSaving(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        preferredLanguage: newLanguage,
        country: languageOption.country,
      });

      // Update local store
      useStore.setState({
        user: {
          ...user,
          preferredLanguage: newLanguage,
          country: languageOption.country,
        },
      });

      console.log('✅ Language settings saved:', newLanguage);
    } catch (error) {
      console.error('❌ Error saving language settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    saveLanguageSettings(language);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Preferred Language</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedLanguage}
          onValueChange={handleLanguageChange}
          enabled={!isSaving}
          style={styles.picker}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
      <Text style={styles.helpText}>
        Messages will be automatically translated to your preferred language when needed
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: Platform.OS === 'ios' ? 180 : 50,
    ...Platform.select({
      android: {
        color: '#000',
      },
    }),
  },
  helpText: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
});
