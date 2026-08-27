// Emergency Medical Guidance Chatbot
// Provides first aid instructions while waiting for ambulance

const emergencyGuidance = {
    'cpr': {
        title: 'CPR Instructions',
        steps: [
            '⚠️ CALL 108 if not already done',
            '1️⃣ Check if person is responsive - tap shoulders and shout',
            '2️⃣ If unresponsive, place on firm, flat surface',
            '3️⃣ Place heel of hand on center of chest',
            '4️⃣ Place other hand on top, interlock fingers',
            '5️⃣ Push hard and fast - 100-120 compressions per minute',
            '6️⃣ Push down at least 2 inches (5cm)',
            '7️⃣ Continue until ambulance arrives or person responds',
            '💡 Tip: Push to the beat of "Stayin\' Alive" song',
            '👶 For infants: Use 2 fingers, compress 1.5 inches deep'
        ]
    },
    'pregnancy': {
        title: 'Pregnancy Emergency',
        steps: [
            '⚠️ IMMEDIATE MEDICAL ATTENTION REQUIRED',
            '🚨 Emergency Signs: Severe bleeding, severe pain, water breaks',
            '1️⃣ Keep mother calm and lying on left side',
            '2️⃣ Do NOT try to delay or stop labor',
            '3️⃣ If baby is coming: Do NOT push baby back',
            '4️⃣ Support baby\'s head as it emerges',
            '5️⃣ After birth: Wrap baby in clean cloth, keep warm',
            '6️⃣ Do NOT cut umbilical cord - wait for paramedics',
            '7️⃣ If bleeding: Apply gentle pressure with clean pad',
            '⚠️ Severe abdominal pain + bleeding = Medical emergency',
            '💡 Note time of contractions (how often, how long)'
        ]
    },
    'seizure': {
        title: 'Seizure Response',
        steps: [
            '⚠️ Stay calm - most seizures stop within 2-3 minutes',
            '1️⃣ Clear area of hard/sharp objects',
            '2️⃣ Cushion head with something soft',
            '3️⃣ Time the seizure - note when it starts',
            '4️⃣ Do NOT restrain person or hold them down',
            '5️⃣ Do NOT put anything in their mouth',
            '6️⃣ After seizure: Turn person on side (recovery position)',
            '7️⃣ Stay with person until fully conscious',
            '🚨 Call ambulance if: Seizure lasts >5 min, multiple seizures, first time, pregnant, injured',
            '💡 Loosen tight clothing around neck'
        ]
    },
    'poisoning': {
        title: 'Poisoning Emergency',
        steps: [
            '⚠️ CALL POISON CONTROL: 1800-11-4567 (India)',
            '🚨 Try to identify what was swallowed',
            '1️⃣ If conscious: Keep person calm and still',
            '2️⃣ Do NOT make person vomit unless told by expert',
            '3️⃣ If chemical on skin: Remove clothing, rinse 20+ min',
            '4️⃣ If in eyes: Flush with water for 15-20 minutes',
            '5️⃣ Save container/substance for paramedics',
            '6️⃣ If unconscious: Place in recovery position',
            '7️⃣ If not breathing: Start CPR',
            '⚠️ Do NOT give milk, food, or activated charcoal',
            '💡 Note: What, when, how much was taken'
        ]
    },
    'fracture': {
        title: 'Broken Bone (Fracture)',
        steps: [
            '⚠️ Do NOT move person if neck/back injury suspected',
            '1️⃣ Do NOT try to straighten broken bone',
            '2️⃣ Immobilize injured area - keep it still',
            '3️⃣ Apply ice pack wrapped in cloth (not directly)',
            '4️⃣ For arm/leg: Use splint or rolled newspaper',
            '5️⃣ Support injured area above and below break',
            '6️⃣ Elevate if possible to reduce swelling',
            '7️⃣ Watch for numbness, tingling, or color change',
            '🚨 Open fracture (bone visible): Cover with clean cloth',
            '⚠️ Do NOT give food or water (may need surgery)',
            '💡 Apply ice for 20 min, remove for 20 min'
        ]
    },
    'diabetic': {
        title: 'Diabetic Emergency',
        steps: [
            '⚠️ Low blood sugar (hypoglycemia) is most common',
            '🚨 Symptoms: Sweating, shaking, confusion, pale, weak',
            '1️⃣ If conscious: Give sugary drink/candy immediately',
            '2️⃣ Give 15g sugar: 3-4 glucose tablets OR 1/2 cup juice',
            '3️⃣ Wait 15 minutes, check if symptoms improve',
            '4️⃣ If no improvement: Give more sugar, call ambulance',
            '5️⃣ If unconscious: Do NOT give anything by mouth',
            '6️⃣ Place in recovery position, call ambulance',
            '7️⃣ If person has glucagon kit: Follow instructions',
            '⚠️ High blood sugar: Fruity breath, very thirsty, confused',
            '💡 Diabetics should carry glucose tablets/candy'
        ]
    },
    'allergic': {
        title: 'Severe Allergic Reaction',
        steps: [
            '⚠️ ANAPHYLAXIS IS LIFE-THREATENING',
            '🚨 Signs: Swelling face/throat, difficulty breathing, rash',
            '1️⃣ Call ambulance immediately',
            '2️⃣ If person has EpiPen: Help them use it NOW',
            '3️⃣ Inject into outer thigh, hold 10 seconds',
            '4️⃣ Keep person lying down (unless breathing difficult)',
            '5️⃣ If breathing stops: Start CPR',
            '6️⃣ Second dose may be needed after 5-15 minutes',
            '7️⃣ Save what caused reaction for paramedics',
            '⚠️ Even if EpiPen used, ambulance still needed',
            '💡 Common triggers: Nuts, shellfish, bee stings, medications'
        ]
    },
    'drowning': {
        title: 'Drowning/Near Drowning',
        steps: [
            '⚠️ YOUR SAFETY FIRST - Do not become second victim',
            '1️⃣ Get person out of water safely',
            '2️⃣ Check if breathing - look, listen, feel',
            '3️⃣ If NOT breathing: Start CPR immediately',
            '4️⃣ Do NOT try to drain water from lungs',
            '5️⃣ Continue CPR until breathing or help arrives',
            '6️⃣ If breathing: Place in recovery position',
            '7️⃣ Remove wet clothes, keep warm with blanket',
            '8️⃣ Watch for vomiting - turn head to side',
            '🚨 Even if seems fine, medical check needed',
            '💡 Hypothermia risk - keep person warm'
        ]
    },
    'heatstroke': {
        title: 'Heat Stroke',
        steps: [
            '⚠️ LIFE-THREATENING - Body temperature >40°C',
            '🚨 Signs: Hot dry skin, confusion, seizures, unconscious',
            '1️⃣ Move person to cool, shaded area',
            '2️⃣ Remove excess clothing',
            '3️⃣ Cool person rapidly: Wet skin with water',
            '4️⃣ Fan person while skin is wet',
            '5️⃣ Apply ice packs to neck, armpits, groin',
            '6️⃣ If conscious: Give cool water to sip',
            '7️⃣ Continue cooling until body temp drops',
            '8️⃣ If unconscious: Recovery position, monitor breathing',
            '⚠️ Do NOT give aspirin or acetaminophen',
            '💡 Goal: Reduce temperature to 38-39°C'
        ]
    },
    'hypothermia': {
        title: 'Hypothermia (Extreme Cold)',
        steps: [
            '⚠️ Body temperature drops below 35°C',
            '🚨 Signs: Shivering, confusion, slurred speech, drowsiness',
            '1️⃣ Move person to warm, dry place',
            '2️⃣ Remove wet clothing gently',
            '3️⃣ Wrap in blankets, cover head (leave face exposed)',
            '4️⃣ Give warm (not hot) drinks if conscious',
            '5️⃣ Do NOT give alcohol',
            '6️⃣ Do NOT rub or massage person',
            '7️⃣ Do NOT use direct heat (heating pad, hot water)',
            '8️⃣ Warm person gradually and gently',
            '⚠️ Handle person gently - rough movement can cause cardiac arrest',
            '💡 Share body heat if no blankets available'
        ]
    },
    'spinal': {
        title: 'Spinal Injury Suspected',
        steps: [
            '⚠️ CRITICAL - Do NOT move person unless in danger',
            '🚨 Suspect if: Fall from height, diving, car crash, head injury',
            '1️⃣ Keep person completely still',
            '2️⃣ Tell person not to move head or neck',
            '3️⃣ Support head and neck in position found',
            '4️⃣ Place rolled towels/clothes on both sides of head',
            '5️⃣ Do NOT remove helmet if wearing one',
            '6️⃣ If must move (fire/danger): Keep head, neck, spine aligned',
            '7️⃣ If vomiting: Log roll entire body as one unit',
            '8️⃣ Monitor breathing - start CPR if needed',
            '⚠️ Even slight movement can cause paralysis',
            '💡 Wait for trained paramedics with proper equipment'
        ]
    },
    'eye-injury': {
        title: 'Eye Injury',
        steps: [
            '⚠️ Do NOT rub or apply pressure to eye',
            '1️⃣ For chemical in eye: Flush with water 15-20 min',
            '2️⃣ Tilt head, pour water from inner to outer corner',
            '3️⃣ For object in eye: Do NOT try to remove it',
            '4️⃣ Cover both eyes with clean cloth (reduces movement)',
            '5️⃣ For cuts: Do NOT rinse, cover gently',
            '6️⃣ For embedded object: Stabilize with cup/cone',
            '7️⃣ Do NOT apply ointment or medication',
            '8️⃣ Keep person calm and still',
            '⚠️ All eye injuries need medical evaluation',
            '💡 If contact lenses: Remove only if trained'
        ]
    },
    'bleeding': {
        title: 'How to Stop Bleeding',
        steps: [
            '⚠️ Severe bleeding can be life-threatening',
            '1️⃣ Apply direct pressure with clean cloth',
            '2️⃣ Press firmly for 10-15 minutes without checking',
            '3️⃣ If blood soaks through, add more cloth on top',
            '4️⃣ Elevate injured area above heart if possible',
            '5️⃣ Do NOT remove embedded objects',
            '6️⃣ Keep person warm and lying down',
            '7️⃣ Continue pressure until ambulance arrives',
            '⚠️ If bleeding from nose/ears after head injury - do not stop it'
        ]
    },
    'choking': {
        title: 'Choking Emergency',
        steps: [
            '⚠️ If person cannot cough, speak, or breathe:',
            '1️⃣ Stand behind person, wrap arms around waist',
            '2️⃣ Make a fist, place above navel',
            '3️⃣ Grasp fist with other hand',
            '4️⃣ Give quick upward thrusts (Heimlich maneuver)',
            '5️⃣ Repeat until object comes out',
            '👶 For infants: Use back blows and chest thrusts',
            '⚠️ If person becomes unconscious, start CPR',
            '💡 Do NOT slap back if person is standing'
        ]
    },
    'burns': {
        title: 'Burn Treatment',
        steps: [
            '⚠️ For serious burns, wait for ambulance',
            '1️⃣ Remove from heat source immediately',
            '2️⃣ Cool burn with running water for 10-20 minutes',
            '3️⃣ Remove jewelry/tight clothing before swelling',
            '4️⃣ Cover with clean, dry cloth',
            '5️⃣ Do NOT apply ice, butter, or ointments',
            '6️⃣ Do NOT break blisters',
            '7️⃣ Keep person warm with blanket',
            '⚠️ For chemical burns: Flush with water for 20+ minutes'
        ]
    },
    'unconscious': {
        title: 'Unconscious Person',
        steps: [
            '⚠️ Do NOT move if spinal injury suspected',
            '1️⃣ Check for response - tap and shout',
            '2️⃣ Check breathing - look, listen, feel',
            '3️⃣ If breathing: Place in recovery position',
            '4️⃣ If NOT breathing: Start CPR immediately',
            '5️⃣ Loosen tight clothing around neck',
            '6️⃣ Do NOT give anything to eat or drink',
            '7️⃣ Monitor breathing until ambulance arrives',
            '💡 Recovery position: On side, head tilted back'
        ]
    },
    'heart-attack': {
        title: 'Heart Attack Response',
        steps: [
            '⚠️ IMMEDIATE ACTION REQUIRED',
            '🚨 Symptoms: Chest pain, shortness of breath, sweating',
            '1️⃣ Help person sit down and rest',
            '2️⃣ Loosen tight clothing',
            '3️⃣ If person has aspirin, give 300mg to chew',
            '4️⃣ Keep person calm and reassured',
            '5️⃣ Do NOT leave person alone',
            '6️⃣ If person becomes unconscious, start CPR',
            '7️⃣ Stay with person until ambulance arrives',
            '⚠️ Do NOT give aspirin if allergic or bleeding disorder'
        ]
    },
    'stroke': {
        title: 'Stroke Recognition (FAST)',
        steps: [
            '⚠️ TIME IS CRITICAL - Every minute counts',
            '🔍 FAST Test:',
            'F - FACE: Ask to smile. Does one side droop?',
            'A - ARMS: Raise both arms. Does one drift down?',
            'S - SPEECH: Repeat simple phrase. Is speech slurred?',
            'T - TIME: If YES to any, call ambulance NOW',
            '1️⃣ Note time symptoms started',
            '2️⃣ Keep person calm and comfortable',
            '3️⃣ Loosen tight clothing',
            '4️⃣ Do NOT give food, drink, or medication',
            '5️⃣ If unconscious, place in recovery position'
        ]
    }
};

class EmergencyChatbot {
    constructor() {
        this.container = document.getElementById('chatbot-container');
        this.toggle = document.getElementById('chatbot-toggle');
        this.window = document.getElementById('chatbot-window');
        this.close = document.getElementById('chatbot-close');
        this.messages = document.getElementById('chatbot-messages');
        this.options = document.getElementById('chatbot-options');
        this.assistant = document.getElementById('chatbot-assistant');
        this.greeting = document.getElementById('assistant-greeting');
        
        this.greetingTimeout = null;
        
        this.init();
    }
    
    init() {
        // Toggle chatbot window
        this.toggle.addEventListener('click', () => {
            this.window.classList.toggle('open');
            
            // Hide greeting when chatbot opens
            if (this.window.classList.contains('open')) {
                this.hideGreeting();
            }
        });
        
        // Close chatbot
        this.close.addEventListener('click', () => {
            this.window.classList.remove('open');
        });
        
        // Handle option clicks
        this.options.addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-option-btn');
            if (btn) {
                const topic = btn.dataset.topic;
                this.handleTopic(topic);
            }
        });
    }
    
    show() {
        this.container.classList.add('active');
        console.log('✓ Chatbot container shown');
        
        // Show assistant with delay
        setTimeout(() => {
            this.showAssistant();
        }, 1000);
        
        // Show greeting after assistant appears
        setTimeout(() => {
            this.showGreeting();
        }, 1500);
        
        // Auto-hide greeting after 5 seconds
        this.greetingTimeout = setTimeout(() => {
            this.hideGreeting();
        }, 6500);
    }
    
    showAssistant() {
        if (this.assistant) {
            // Random medical assistant characters
            const assistants = ['👨‍⚕️', '👩‍⚕️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️'];
            const randomAssistant = assistants[Math.floor(Math.random() * assistants.length)];
            this.assistant.textContent = randomAssistant;
            this.assistant.classList.remove('hidden');
        }
    }
    
    hideAssistant() {
        if (this.assistant) {
            this.assistant.classList.add('hidden');
        }
    }
    
    showGreeting() {
        if (this.greeting) {
            // Random greeting messages
            const greetings = [
                'Hi! Need emergency help? 👋',
                'I\'m here to help! 💪',
                'Emergency guidance ready! 🚑',
                'Click me for first aid tips! 💡',
                'Medical help available! ⚕️'
            ];
            const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            this.greeting.textContent = randomGreeting;
            this.greeting.classList.remove('hidden');
        }
    }
    
    hideGreeting() {
        if (this.greeting) {
            this.greeting.classList.add('hidden');
        }
        if (this.greetingTimeout) {
            clearTimeout(this.greetingTimeout);
        }
    }
    
    hide() {
        this.container.classList.remove('active');
        this.hideAssistant();
        this.hideGreeting();
    }
    
    handleTopic(topic) {
        if (topic === 'back') {
            this.addMessage('bot', 'Select a topic for emergency guidance:');
            return;
        }
        
        const guidance = emergencyGuidance[topic];
        if (!guidance) return;
        
        // Add user message
        this.addMessage('user', guidance.title);
        
        // Show assistant encouragement
        this.showAssistantEncouragement();
        
        // Add bot response with steps
        setTimeout(() => {
            const stepsHtml = guidance.steps.map(step => {
                // Style warning lines differently
                if (step.startsWith('⚠️') || step.startsWith('🚨')) {
                    return `<div style="color: #dc2626; font-weight: 600; margin: 8px 0;">${step}</div>`;
                }
                return `<div style="margin: 6px 0;">${step}</div>`;
            }).join('');
            
            this.addMessage('bot', stepsHtml, true);
            
            // Add follow-up message
            setTimeout(() => {
                this.addMessage('bot', '💡 Need help with something else? Select another topic below.');
            }, 500);
        }, 300);
    }
    
    showAssistantEncouragement() {
        // Temporarily show encouraging message
        if (this.greeting) {
            const encouragements = [
                'Great choice! 👍',
                'Here to help! 💪',
                'Stay strong! 🌟',
                'You got this! ✨',
                'Perfect! 👌'
            ];
            const randomMsg = encouragements[Math.floor(Math.random() * encouragements.length)];
            this.greeting.textContent = randomMsg;
            this.greeting.classList.remove('hidden');
            
            setTimeout(() => {
                this.greeting.classList.add('hidden');
            }, 2000);
        }
    }
    
    addMessage(sender, text, isHtml = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        if (isHtml) {
            bubble.innerHTML = text;
        } else {
            bubble.textContent = text;
        }
        
        messageDiv.appendChild(bubble);
        this.messages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.messages.scrollTop = this.messages.scrollHeight;
    }
    
    addWelcomeMessage() {
        // Random friendly greetings
        const greetings = [
            '🚑 Ambulance is on the way! While you wait, I can provide emergency first aid guidance.',
            '👋 Help is coming! I\'m here to guide you through any emergency procedures.',
            '🆘 Stay calm! I can help with emergency first aid while you wait for the ambulance.',
            '💪 You\'re doing great! Let me help you with emergency guidance while help arrives.'
        ];
        
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        
        this.addMessage('bot', randomGreeting);
        setTimeout(() => {
            this.addMessage('bot', 'Select a topic below for immediate help:');
        }, 500);
    }
}

// Initialize chatbot immediately
let chatbot = null;

// Initialize as soon as script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
} else {
    initChatbot();
}

function initChatbot() {
    chatbot = new EmergencyChatbot();
    window.emergencyChatbot = chatbot;
    console.log('✓ Emergency chatbot initialized and ready');
}
