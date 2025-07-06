import fs from "fs";

export default class PersonalizationEngine {
    constructor(filePath = "./userProfiles.json") {
        this.filePath = filePath;
        this.userProfiles = new Map();
        this.load();
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
            for (const [userId, profile] of Object.entries(data)) {
                this.userProfiles.set(userId, profile);
            }
        }
    }

    save() {
        const obj = Object.fromEntries(this.userProfiles);
        fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
    }

    addEvent(userId, docId, eventType = "click") {
        if (!this.userProfiles.has(userId)) {
            this.userProfiles.set(userId, {});
        }
        const profile = this.userProfiles.get(userId);
        if (!profile.events) profile.events = {};
        profile.events[docId] = (profile.events[docId] || 0) + 1;
        this.save();
    }

    getBoost(userId, docId) {
        const profile = this.userProfiles.get(userId);
        if (!profile || !profile.events) return 0;
        return profile.events[docId] || 0;
    }
}
