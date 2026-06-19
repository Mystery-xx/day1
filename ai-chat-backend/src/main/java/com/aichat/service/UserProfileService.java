package com.aichat.service;

import com.aichat.entity.UserProfile;
import com.aichat.repository.UserProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class UserProfileService {

    private final UserProfileRepository repository;

    public UserProfileService(UserProfileRepository repository) {
        this.repository = repository;
    }

    /**
     * Creates default user profiles at application startup.
     * Profiles are checked by profileName to prevent duplicates on restart.
     */
    @PostConstruct
    public void createDefaultProfiles() {
        // Default profile - active by default
        createProfileIfNotExists(
            "Default",
            "",
            null,
            "none",
            "Без профиля. AI отвечает в стандартном стиле.",
            true
        );

        // Junior Developer profile
        createProfileIfNotExists(
            "Junior Developer",
            "Я начинающий разработчик. Мне нужны подробные объяснения, шаг за шагом. Приводи примеры кода. Разбирай каждую концепцию детально. Отвечай на русском языке.",
            "ru",
            "detailed",
            "Подробные объяснения для начинающих разработчиков",
            false
        );

        // Senior Developer profile
        createProfileIfNotExists(
            "Senior Developer",
            "Я опытный разработчик. Мне нужны краткие ответы по существу. Фокусируйся на ключевых моментах. Избегай излишних деталей. Отвечай на русском языке.",
            "ru",
            "concise",
            "Краткие ответы для опытных разработчиков",
            false
        );
    }

    /**
     * Returns the currently active profile, or null if none is active.
     */
    @Transactional(readOnly = true)
    public UserProfile getActiveProfile() {
        return repository.findAll().stream()
            .filter(UserProfile::getIsActive)
            .findFirst()
            .orElse(null);
    }

    /**
     * Activates a profile by ID. Deactivates all other profiles.
     * @param profileId the ID of the profile to activate
     * @return the activated profile, or null if profile not found
     */
    public UserProfile setActiveProfile(Long profileId) {
        Optional<UserProfile> optionalProfile = repository.findById(profileId);
        if (optionalProfile.isEmpty()) {
            return null;
        }

        UserProfile profileToActivate = optionalProfile.get();

        // Deactivate all profiles
        List<UserProfile> allProfiles = repository.findAll();
        for (UserProfile p : allProfiles) {
            if (!p.getId().equals(profileId)) {
                p.setIsActive(false);
            }
        }

        // Activate the selected profile
        profileToActivate.setIsActive(true);

        // Save all changes
        repository.saveAll(allProfiles);

        return profileToActivate;
    }

    /**
     * Returns all user profiles.
     */
    @Transactional(readOnly = true)
    public List<UserProfile> getAllProfiles() {
        return repository.findAll();
    }

    /**
     * Returns a profile by ID, or null if not found.
     */
    @Transactional(readOnly = true)
    public UserProfile getProfileById(Long id) {
        return repository.findById(id).orElse(null);
    }

    /**
     * Checks if a profile is currently active.
     * @param profileId the ID of the profile to check
     * @return true if the profile is active, false otherwise
     */
    @Transactional(readOnly = true)
    public boolean isProfileActive(Long profileId) {
        return repository.findById(profileId)
            .map(UserProfile::getIsActive)
            .orElse(false);
    }

    /**
     * Helper method to create a profile only if it doesn't already exist.
     * Checks by profileName to prevent duplicates.
     */
    private void createProfileIfNotExists(String profileName, String promptTemplate,
                                           String language, String communicationStyle,
                                           String description, Boolean isActive) {
        boolean exists = repository.findAll().stream()
            .anyMatch(p -> p.getProfileName().equals(profileName));

        if (!exists) {
            UserProfile profile = UserProfile.builder()
                .profileName(profileName)
                .promptTemplate(promptTemplate)
                .language(language)
                .communicationStyle(communicationStyle)
                .description(description)
                .isActive(isActive)
                .user(null)
                .build();
            repository.save(profile);
        }
    }
}
