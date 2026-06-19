package com.aichat.controller;

import com.aichat.entity.UserProfile;
import com.aichat.service.UserProfileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/chat/profiles")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class UserProfileController {

    private static final Logger logger = LoggerFactory.getLogger(UserProfileController.class);

    private final UserProfileService profileService;

    public UserProfileController(UserProfileService profileService) {
        this.profileService = profileService;
    }

    /**
     * Get all user profiles.
     * GET /api/chat/profiles
     */
    @GetMapping
    public ResponseEntity<List<UserProfile>> getAllProfiles() {
        logger.info("Fetching all user profiles");
        List<UserProfile> profiles = profileService.getAllProfiles();
        return ResponseEntity.ok(profiles);
    }

    /**
     * Get profile by ID.
     * GET /api/chat/profiles/{id}
     */
    @GetMapping("/{id}")
    public ResponseEntity<UserProfile> getProfileById(@PathVariable Long id) {
        logger.info("Fetching profile with id: {}", id);
        UserProfile profile = profileService.getProfileById(id);
        if (profile == null) {
            logger.warn("Profile not found with id: {}", id);
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(profile);
    }

    /**
     * Activate profile by ID.
     * POST /api/chat/profiles/{id}/activate
     */
    @PostMapping("/{id}/activate")
    public ResponseEntity<UserProfile> activateProfile(@PathVariable Long id) {
        logger.info("Activating profile with id: {}", id);
        UserProfile activatedProfile = profileService.setActiveProfile(id);
        if (activatedProfile == null) {
            logger.warn("Profile not found for activation with id: {}", id);
            return ResponseEntity.notFound().build();
        }
        logger.info("Successfully activated profile: {}", activatedProfile.getProfileName());
        return ResponseEntity.ok(activatedProfile);
    }

    /**
     * Get currently active profile.
     * GET /api/chat/profiles/active
     */
    @GetMapping("/active")
    public ResponseEntity<UserProfile> getActiveProfile() {
        logger.info("Fetching active user profile");
        UserProfile activeProfile = profileService.getActiveProfile();
        if (activeProfile == null) {
            logger.warn("No active profile found");
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(activeProfile);
    }
}
