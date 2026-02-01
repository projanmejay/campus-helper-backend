import 'package:flutter/material.dart';

class NavigationScreen extends StatelessWidget {
  const NavigationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nalanda Navigation'),
      ),
      body: Column(
        children: [
          const SizedBox(height: 16),

          // 🔍 Zoomable + horizontally pannable image
          SizedBox(
            height: 250, // visible area height
            width: double.infinity,
            child: InteractiveViewer(
              panEnabled: true,     // allow drag
              scaleEnabled: true,   // allow zoom
              minScale: 1.0,
              maxScale: 4.0,
              constrained: true,
              child: Image.asset(
                'assets/images/nalanda.jpeg', // 👈 your image
                fit: BoxFit.contain,
              ),
            ),
          ),

          const SizedBox(height: 20),

          const Text(
            'Nalanda',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 6),

          const Text(
            'Pinch to zoom • Drag to explore',
            style: TextStyle(
              fontSize: 14,
              color: Colors.black54,
            ),
          ),
        ],
      ),
    );
  }
}
