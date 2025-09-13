import fs from "fs";
import { DocumentId } from './valueObjects/index.js';

/**
 * User Profile represents user behavior and preferences
 */
export interface UserProfile {
    events?: Record<string, number>;
    preferences?: Record<string, any>;
    lastActivity?: Date;
    tags?: string[];
}

/**
 * User Event Types
 */
export enum UserEventType {
    CLICK = 'click',
    VIEW = 'view',
    PURCHASE = 'purchase',
    BOOKMARK = 'bookmark',
    SHARE = 'share',
    LIKE = 'like',
    DISLIKE = 'dislike'
}

/**
 * User Profiles Data structure for persistence
 */
export interface UserProfilesData {
    [userId: string]: UserProfile;
}

/**
 * PersonalizationEngine Interface
 * Defines the contract for personalization operations
 */
export interface IPersonalizationEngine {
    addEvent(userId: string, docId: DocumentId, eventType?: UserEventType): void;
    getBoost(userId: string, docId: DocumentId): number;
    load(): void;
    save(): void;
}

/**
 * PersonalizationEngine Domain Service
 * Manages user profiles and provides personalization features
 */
export default class PersonalizationEngine implements IPersonalizationEngine {
    private readonly filePath: string;
    private readonly userProfiles: Map<string, UserProfile>;

    constructor(filePath: string = "./userProfiles.json") {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('File path must be a non-empty string');
        }

        this.filePath = filePath;
        this.userProfiles = new Map();
        this.load();
    }

    /**
     * Load user profiles from file
     */
    load(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as UserProfilesData;

                if (typeof data !== 'object' || data === null) {
                    throw new Error('Invalid user profiles data format');
                }

                for (const [userId, profile] of Object.entries(data)) {
                    if (typeof profile === 'object' && profile !== null) {
                        // Convert date strings back to Date objects
                        if (profile.lastActivity && typeof profile.lastActivity === 'string') {
                            profile.lastActivity = new Date(profile.lastActivity);
                        }
                        this.userProfiles.set(userId, profile);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading user profiles from ${this.filePath}:`, error);
            // Continue with empty profiles map
        }
    }

    /**
     * Save user profiles to file
     */
    save(): void {
        try {
            const obj: UserProfilesData = Object.fromEntries(this.userProfiles);
            fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error(`Error saving user profiles to ${this.filePath}:`, error);
            throw new Error(`Failed to save user profiles: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Add an event for a user
     * @param userId - The user ID
     * @param docId - The document ID
     * @param eventType - The type of event (default: click)
     */
    addEvent(userId: string, docId: DocumentId, eventType: UserEventType = UserEventType.CLICK): void {
        if (!userId || typeof userId !== 'string') {
            throw new Error('User ID must be a non-empty string');
        }
        if (!(docId instanceof DocumentId)) {
            throw new Error('Document ID must be a DocumentId instance');
        }

        if (!this.userProfiles.has(userId)) {
            this.userProfiles.set(userId, {
                events: {},
                lastActivity: new Date(),
                tags: []
            });
        }

        const profile = this.userProfiles.get(userId)!;
        if (!profile.events) {
            profile.events = {};
        }

        const docIdStr = docId.value;
        profile.events[docIdStr] = (profile.events[docIdStr] || 0) + 1;
        profile.lastActivity = new Date();

        this.save();
    }

    /**
     * Get boost score for a user and document
     * @param userId - The user ID
     * @param docId - The document ID
     * @returns Boost score (0 if no interaction)
     */
    getBoost(userId: string, docId: DocumentId): number {
        if (!userId || typeof userId !== 'string') {
            return 0;
        }
        if (!(docId instanceof DocumentId)) {
            return 0;
        }

        const profile = this.userProfiles.get(userId);
        if (!profile || !profile.events) {
            return 0;
        }

        const docIdStr = docId.value;
        return profile.events[docIdStr] || 0;
    }

    /**
     * Get user profile
     * @param userId - The user ID
     * @returns User profile or null if not found
     */
    getUserProfile(userId: string): UserProfile | null {
        if (!userId || typeof userId !== 'string') {
            return null;
        }

        return this.userProfiles.get(userId) || null;
    }

    /**
     * Set user preferences
     * @param userId - The user ID
     * @param preferences - User preferences object
     */
    setUserPreferences(userId: string, preferences: Record<string, any>): void {
        if (!userId || typeof userId !== 'string') {
            throw new Error('User ID must be a non-empty string');
        }
        if (!preferences || typeof preferences !== 'object') {
            throw new Error('Preferences must be an object');
        }

        if (!this.userProfiles.has(userId)) {
            this.userProfiles.set(userId, {
                events: {},
                lastActivity: new Date(),
                tags: []
            });
        }

        const profile = this.userProfiles.get(userId)!;
        profile.preferences = { ...preferences };
        profile.lastActivity = new Date();

        this.save();
    }

    /**
     * Add tags to user profile
     * @param userId - The user ID
     * @param tags - Array of tags to add
     */
    addUserTags(userId: string, tags: string[]): void {
        if (!userId || typeof userId !== 'string') {
            throw new Error('User ID must be a non-empty string');
        }
        if (!Array.isArray(tags)) {
            throw new Error('Tags must be an array');
        }

        if (!this.userProfiles.has(userId)) {
            this.userProfiles.set(userId, {
                events: {},
                lastActivity: new Date(),
                tags: []
            });
        }

        const profile = this.userProfiles.get(userId)!;
        if (!profile.tags) {
            profile.tags = [];
        }

        // Add unique tags
        for (const tag of tags) {
            if (typeof tag === 'string' && !profile.tags.includes(tag)) {
                profile.tags.push(tag);
            }
        }

        profile.lastActivity = new Date();
        this.save();
    }

    /**
     * Get all user IDs
     * @returns Array of user IDs
     */
    getUserIds(): string[] {
        return Array.from(this.userProfiles.keys());
    }

    /**
     * Remove user profile
     * @param userId - The user ID
     * @returns True if profile was removed
     */
    removeUser(userId: string): boolean {
        if (!userId || typeof userId !== 'string') {
            return false;
        }

        const removed = this.userProfiles.delete(userId);
        if (removed) {
            this.save();
        }

        return removed;
    }

    /**
     * Clear all user profiles
     */
    clear(): void {
        this.userProfiles.clear();
        this.save();
    }

    /**
     * Get statistics about user profiles
     * @returns Statistics object
     */
    getStats(): { totalUsers: number; totalEvents: number; averageEventsPerUser: number } {
        const totalUsers = this.userProfiles.size;
        let totalEvents = 0;

        for (const profile of this.userProfiles.values()) {
            if (profile.events) {
                totalEvents += Object.values(profile.events).reduce((sum, count) => sum + count, 0);
            }
        }

        return {
            totalUsers,
            totalEvents,
            averageEventsPerUser: totalUsers > 0 ? totalEvents / totalUsers : 0
        };
    }
}