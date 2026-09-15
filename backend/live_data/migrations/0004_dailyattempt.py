from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("live_data", "0003_leaderboard_daily_guardrails")]

    operations = [
        migrations.CreateModel(
            name="DailyAttempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("player_key", models.CharField(max_length=64)),
                ("answers", models.JSONField(default=list)),
                ("score", models.PositiveSmallIntegerField(default=0)),
                ("completed", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("challenge", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="attempts", to="live_data.dailychallenge")),
            ],
        ),
        migrations.AddConstraint(
            model_name="dailyattempt",
            constraint=models.UniqueConstraint(fields=("challenge", "player_key"), name="unique_daily_player_attempt"),
        ),
    ]
